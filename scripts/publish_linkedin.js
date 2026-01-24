import fs from "fs";
import path from "path";

// -------------------------------------------------------
// CONFIG
// -------------------------------------------------------
const POSTS_DIR = "posts";
const AUTHOR_URN = process.env.LINKEDIN_AUTHOR_URN || ""; // ex: "urn:li:person:XXXXXXXX"
const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN || "";

// LinkedIn v2 endpoints
const LINKEDIN_POST_ENDPOINT = "https://api.linkedin.com/v2/ugcPosts";

// -------------------------------------------------------
// HELPERS
// -------------------------------------------------------
function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => path.join(dir, f))
    .sort();
}

function parseFrontMatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return { meta: {}, body: text };

  let i = 1;
  const meta = {};
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === "---") { i++; break; }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    meta[key] = val;
  }
  const body = lines.slice(i).join("\n").trim();
  return { meta, body };
}

function isReady(meta) {
  // Keep consistent with your other autoposters:
  // status: ready / posted / draft
  const status = (meta.status || "").toLowerCase();
  return status === "ready";
}

function markPosted(filePath, originalText) {
  // Update front matter: status: posted
  // If no front matter, add it.
  if (originalText.startsWith("---\n") || originalText.startsWith("---\r\n")) {
    // Replace existing status line if present; else insert after first ---
    const hasStatus = /^status:\s*/im.test(originalText);
    if (hasStatus) {
      const updated = originalText.replace(/^status:\s*.*$/im, "status: posted");
      fs.writeFileSync(filePath, updated, "utf8");
      return;
    }
    // insert after opening ---
    const updated = originalText.replace(/^---\s*\r?\n/, match => `${match}status: posted\n`);
    fs.writeFileSync(filePath, updated, "utf8");
    return;
  }

  const updated = `---\nstatus: posted\n---\n\n${originalText.trim()}\n`;
  fs.writeFileSync(filePath, updated, "utf8");
}

function buildText(meta, body) {
  // Optional fields: title, link
  const title = meta.title ? meta.title.trim() : "";
  const link = meta.link ? meta.link.trim() : "";

  let text = body?.trim() || "";
  if (title && !text.toLowerCase().startsWith(title.toLowerCase())) {
    text = `${title}\n\n${text}`;
  }

  if (link) {
    // LinkedIn does better when the URL is on its own line
    text = `${text}\n\n${link}`;
  }

  // Keep it simple and safe. LinkedIn max is large, but don't blast.
  return text.slice(0, 2800);
}

async function httpJson(url, method, headers, bodyObj) {
  const res = await fetch(url, {
    method,
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    const msg = `[LinkedIn] HTTP ${res.status}: ${JSON.stringify(json)}`;
    throw new Error(msg);
  }
  return json;
}

// -------------------------------------------------------
// MAIN
// -------------------------------------------------------
async function main() {
  if (!AUTHOR_URN) {
    console.error("Missing LINKEDIN_AUTHOR_URN (e.g., urn:li:person:XXXX).");
    process.exit(1);
  }
  if (!ACCESS_TOKEN) {
    console.error("Missing LINKEDIN_ACCESS_TOKEN.");
    process.exit(1);
  }

  const files = listMarkdownFiles(POSTS_DIR);
  if (!files.length) {
    console.log("No posts folder or no .md files found.");
    return;
  }

  let chosen = null;
  let chosenText = null;
  let chosenMeta = null;
  let chosenBody = null;

  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const { meta, body } = parseFrontMatter(text);
    if (!isReady(meta)) continue;

    chosen = f;
    chosenText = text;
    chosenMeta = meta;
    chosenBody = body;
    break;
  }

  if (!chosen) {
    console.log("No ready LinkedIn posts found.");
    return;
  }

  const postText = buildText(chosenMeta, chosenBody);

  // Basic "text post" via UGC
  const payload = {
    author: AUTHOR_URN,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: postText },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  console.log("Publishing LinkedIn post from:", chosen);

  const headers = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  const result = await httpJson(LINKEDIN_POST_ENDPOINT, "POST", headers, payload);
  console.log("LinkedIn publish result:", JSON.stringify(result));

  // Mark posted
  markPosted(chosen, chosenText);
  console.log("Marked as posted:", chosen);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
