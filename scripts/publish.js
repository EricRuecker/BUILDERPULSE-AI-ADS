import fs from "fs";
import path from "path";

const POSTS_DIR = "posts";
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .map((f) => path.join(dir, f));
}

function parseFrontMatter(mdText) {
  const lines = mdText.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { meta: {}, body: mdText.trim() };

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

    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof value === "string") {
      value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
    meta[key] = value;
  }

  const body = lines.slice(i + 1).join("\n").trim();
  return { meta, body };
}

const files = listMarkdownFiles(POSTS_DIR);
console.log(`[INFO] Found ${files.length} markdown post(s) in /${POSTS_DIR}`);

const posts = files
  .map((filePath) => {
    const md = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseFrontMatter(md);
    return { filePath, meta, body };
  })
  .sort((a, b) => a.filePath.localeCompare(b.filePath));

for (const p of posts) {
  const status = (p.meta.status || "missing").toString();
  const platforms = Array.isArray(p.meta.platforms)
    ? p.meta.platforms.join(",")
    : (p.meta.platforms || "");
  console.log(`- ${p.filePath} | status=${status} | platforms=${platforms}`);
}

if (DRY_RUN) {
  console.log("\n[DRY-RUN] Showing post bodies (no publishing):");
  for (const p of posts) {
    console.log(`\n---\nFILE: ${p.filePath}\nID: ${p.meta.id || "n/a"}\nTEXT:\n${p.body}\n---`);
  }
  process.exit(0);
}

console.log("[INFO] Publishing not configured yet. Add API tokens + platform code next.");
process.exit(0);
