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

    // Your generator used JSON.stringify(), so captions are valid JSON strings.
    // This will safely parse quoted strings (and falls back to plain text).
    try {
      meta[key] = JSON.parse(raw);
    } catch {
      meta[key] = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  }

  const body = lines.slice(i + 1).join("\n");
  return { meta, body };
}

async function igCreateContainer({ igBusinessId, token, imageUrl, caption }) {
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption || "",
    access_token: token,
  });

  const res = await fetch(`https://graph.facebook.com/v24.0/${igBusinessId}/media`, {
    method: "POST",
    body: params,
  });

  const json = await res.json();
  if (!res.ok) {
    const detail = json?.detail || "";
    const status = res.status;
  
    // X duplicate tweet protection
    if (status === 403 && /duplicate content/i.test(detail)) {
      console.log("[X] Duplicate content detected — treating as already posted and skipping.");
      return { skipped: true, reason: "duplicate" };
    }
  
    throw new Error(JSON.stringify(json));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function igPublishWithRetry({ igBusinessId, token, creationId }) {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const mediaId = await igPublishContainer({ igBusinessId, token, creationId });
      return mediaId;
    } catch (e) {
      const msg = String(e?.message || e);
      // IG often returns "Media ID is not available" until the container is ready
      const isNotReady =
        msg.includes("Media ID is not available") ||
        msg.includes("not ready") ||
        msg.includes("\"code\":9007") ||
        msg.includes("2207027");

      if (!isNotReady || attempt === maxAttempts) throw e;

      const waitMs = 3000 * attempt; // 3s, 6s, 9s... backoff
      console.log(`[IG] Not ready yet. Retry ${attempt}/${maxAttempts} in ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }
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

  if (!imageUrl || !String(imageUrl).startsWith("https://")) {
    throw new Error(
      `Post ${path.basename(nextFile)} is missing image_url (must be a public https URL).`
    );
  }

  console.log("[IG] Posting:", path.basename(nextFile));
  console.log("[IG] image_url:", imageUrl);

  const creationId = await igCreateContainer({
    igBusinessId: IG_BUSINESS_ID,
    token: IG_ACCESS_TOKEN,
    imageUrl,
    caption,
  });

  console.log("[IG] Container created:", creationId);

  const mediaId = await igPublishWithRetry({
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
