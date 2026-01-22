import fs from "fs";
import path from "path";

const POSTS_DIR = "posts";

// -------------------------------
// CLI flags
// -------------------------------
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

// -------------------------------
// Helpers
// -------------------------------
function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .map((f) => path.join(dir, f));
}

function parseFrontMatter(mdText) {
  // expects:
  // ---
  // key: value
  // key2: [a, b]
  // ---
  const lines = mdText.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { meta: {}, body: mdText };

  let i = 1;
  const meta = {};
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "---") break;
    if (!line) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    // parse arrays like [facebook, instagram]
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // strip quotes
    if (typeof value === "string") {
      value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }

    meta[key] = value;
  }

  const body = lines.slice(i + 1).join("\n").trim();
  return { meta, body };
}

function isReady(meta) {
  const status = (meta.status || "").toString().toLowerCase();
  return status === "ready";
}

// -------------------------------
// Main
// -------------------------------
const files = listMarkdownFiles(POSTS_DIR);

if (files.length === 0) {
  console.log(`[INFO] No posts found in /${POSTS_DIR}`);
  process.exit(0);
}

const posts = files
  .map((filePath) => {
    const md = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseFrontMatter(md);
    return { filePath, meta, body };
  })
  .sort((a, b) => a.filePath.localeCompare(b.filePath));

const readyPosts = posts.filter((p) => isReady(p.meta));

console.log(`[INFO] Found ${posts.length} post(s). Ready: ${readyPosts.length}.`);
for (const p of posts) {
  const status = (p.meta.status || "missing").toString();
  const platforms = Array.isArray(p.meta.platforms) ? p.meta.platforms.join(",") : (p.meta.platforms || "");
  console.log(`- ${p.filePath} | status=${status} | platforms=${platforms}`);
}

if (readyPosts.length === 0) {
  console.log("[INFO] Nothing to publish.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log("\n[DRY-RUN] Would publish these posts:");
  for (const p of readyPosts) {
    console.log(`\n---\nFILE: ${p.filePath}\nID: ${p.meta.id || "n/a"}\nPLATFORMS: ${Array.isArray(p.meta.platforms) ? p.meta.platforms.join(", ") : p.meta.platforms}\nTEXT:\n${p.body}\n---`);
  }
  process.exit(0);
}

console.log("\n[BLOCKED] Real publishing is not enabled yet.");
console.log("To enable: we’ll add Meta/LinkedIn API tokens + posting functions next.");
process.exit(1);

