import fs from "fs";
import path from "path";

const POSTS_DIR = "posts/instagram";
const POSTED_DIR = path.join(POSTS_DIR, "posted");

const IG_BUSINESS_ID = (process.env.IG_BUSINESS_ID || "").trim();
const IG_ACCESS_TOKEN = (process.env.IG_ACCESS_TOKEN || "").trim();

function listReadyPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(POSTS_DIR, f))
    .sort();
}

function parseFrontMatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return { meta: {}, body: text };

  const meta = {};
  let i = 1;

  for (; i < lines.length; i++) {
    if (lines[i] === "---") break;
    const line = lines[i].trim();
    if (!line) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();

    try {
      meta[key] = JSON.parse(raw);
    } catch {
      meta[key] = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  }

  const body = lines.slice(i + 1).join("\n");
  return { meta, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function igCreateContainer({ igBusinessId, token, imageUrl, videoUrl, caption }) {
  const params = new URLSearchParams({
    caption: caption || "",
    access_token: token,
  });

  if (videoUrl) {
    params.set("media_type", "REELS"); // or "VIDEO"
    params.set("video_url", videoUrl);
  } else {
    params.set("image_url", imageUrl);
  }

  const res = await fetch(`https://graph.facebook.com/v24.0/${igBusinessId}/media`, {
    method: "POST",
    body: params,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`[IG] Create container failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.id; // creation_id
}

// Wait for BOTH images and reels to be ready before publishing
async function igWaitUntilReady({ token, creationId }) {
  const maxAttempts = 60; // 60 * 5s = 300s (5 min)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${creationId}?fields=status_code&access_token=${token}`
    );
    const json = await res.json();

    const statusCode = json?.status_code;

    if (statusCode === "FINISHED") return;

    if (statusCode === "ERROR") {
      throw new Error(`[IG] Container processing ERROR: ${JSON.stringify(json)}`);
    }

    // IN_PROGRESS or temporarily missing right after creation
    await sleep(5000);
  }
  throw new Error("[IG] Timed out waiting for container to finish processing.");
}

async function igPublishContainer({ igBusinessId, token, creationId }) {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });

  const res = await fetch(`https://graph.facebook.com/v24.0/${igBusinessId}/media_publish`, {
    method: "POST",
    body: params,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`[IG] Publish failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.id; // media_id
}

function moveToPosted(filePath) {
  fs.mkdirSync(POSTED_DIR, { recursive: true });
  const dest = path.join(POSTED_DIR, path.basename(filePath));
  fs.renameSync(filePath, dest);
  return dest;
}

async function main() {
  if (!IG_BUSINESS_ID) throw new Error("Missing env IG_BUSINESS_ID (GitHub secret).");
  if (!IG_ACCESS_TOKEN) throw new Error("Missing env IG_ACCESS_TOKEN (GitHub secret).");

  const ready = listReadyPosts();
  if (ready.length === 0) {
    console.log("No ready Instagram posts found in posts/instagram/");
    return;
  }

  const nextFile = ready[0];
  const raw = fs.readFileSync(nextFile, "utf8");
  const { meta } = parseFrontMatter(raw);

  const caption = meta.caption || "";

  const imageUrl = meta.image_url;
  let videoUrl = meta.video_url;

  // Safety net: if someone accidentally puts an mp4 in image_url, treat it as video_url
  if (!videoUrl && typeof imageUrl === "string" && /\.mp4(\?.*)?$/i.test(imageUrl)) {
    videoUrl = imageUrl;
  }

  if (videoUrl) {
    if (!String(videoUrl).startsWith("https://")) {
      throw new Error(`Post ${path.basename(nextFile)} has video_url but it is not a public https URL.`);
    }
  } else {
    if (!imageUrl || !String(imageUrl).startsWith("https://")) {
      throw new Error(
        `Post ${path.basename(nextFile)} is missing image_url (or provide video_url) and must be a public https URL.`
      );
    }
  }

  console.log("[IG] Posting:", path.basename(nextFile));
  if (videoUrl) console.log("[IG] video_url:", videoUrl);
  else console.log("[IG] image_url:", imageUrl);

  const creationId = await igCreateContainer({
    igBusinessId: IG_BUSINESS_ID,
    token: IG_ACCESS_TOKEN,
    imageUrl,
    videoUrl,
    caption,
  });

  console.log("[IG] Container created:", creationId);

  console.log("[IG] Waiting for media processing...");
  await igWaitUntilReady({ token: IG_ACCESS_TOKEN, creationId });
  console.log("[IG] Media ready.");

  const mediaId = await igPublishContainer({
    igBusinessId: IG_BUSINESS_ID,
    token: IG_ACCESS_TOKEN,
    creationId,
  });

  console.log("[IG] Published. media_id:", mediaId);

  const moved = moveToPosted(nextFile);
  console.log("[IG] Moved to:", moved);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

