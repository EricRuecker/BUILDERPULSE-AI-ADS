import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const POSTS_DIR = "posts";

const FB_PAGE_ID = process.env.FB_PAGE_ID || "";
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || "";

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .map((f) => path.join(dir, f))
    .sort((a, b) => a.localeCompare(b));
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

function updateFrontMatter(filePath, patch) {
  const original = fs.readFileSync(filePath, "utf8");
  const lines = original.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new Error(`Missing front-matter in ${filePath}`);

  let end = 1;
  for (; end < lines.length; end++) if (lines[end].trim() === "---") break;

  const fmLines = lines.slice(1, end);
  const rest = lines.slice(end + 1).join("\n");

  const map = new Map();
  for (const l of fmLines) {
    const idx = l.indexOf(":");
    if (idx === -1) continue;
    map.set(l.slice(0, idx).trim(), l.slice(idx + 1).trim());
  }

  for (const [k, v] of Object.entries(patch)) {
    map.set(k, String(v));
  }

  const rebuilt = ["---", ...Array.from(map.entries()).map(([k, v]) => `${k}: ${v}`), "---"].join("\n");
  fs.writeFileSync(filePath, `${rebuilt}\n${rest.replace(/^\n+/, "\n")}`, "utf8");
}

async function postToFacebook(message) {
  if (!FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    throw new Error("Missing FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN (check GitHub Secrets + workflow env).");
  }

  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(FB_PAGE_ID)}/feed`;
  const params = new URLSearchParams();
  params.set("message", message);
  params.set("access_token", FB_PAGE_ACCESS_TOKEN);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(json)}`);
  return json; // { id: "PAGEPOSTID" }
}

function gitCommitAndPush(filePath) {
  execSync(`git config user.name "builderpulse-autopost"`);
  execSync(`git config user.email "actions@users.noreply.github.com"`);
  execSync(`git add ${JSON.stringify(filePath)}`);
  execSync(`git commit -m ${JSON.stringify(`Mark posted: ${path.basename(filePath)}`)}`);
  execSync(`git push`);
}

function includesFacebook(meta) {
  const p = meta.platforms;
  if (Array.isArray(p)) return p.map(String).map(s => s.toLowerCase()).includes("facebook");
  return (p || "").toString().toLowerCase().includes("facebook");
}
function isReady(meta) {
  return (meta.status || "").toString().toLowerCase() === "ready";
}

(async () => {
  const files = listMarkdownFiles(POSTS_DIR);
  if (files.length === 0) {
    console.log(`[INFO] No posts found in /${POSTS_DIR}`);
    process.exit(0);
  }

  let target = null;
  for (const filePath of files) {
    const md = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseFrontMatter(md);
    if (isReady(meta) && includesFacebook(meta)) {
      target = { filePath, meta, body };
      break;
    }
  }

  if (!target) {
    console.log("[INFO] No Facebook posts with status: ready");
    process.exit(0);
  }

  console.log(`[INFO] Posting: ${target.filePath}`);
  const result = await postToFacebook(target.body);

  const now = new Date().toISOString();
  updateFrontMatter(target.filePath, {
    status: "posted",
    posted_at: now,
    fb_post_id: result.id || "unknown",
  });

  gitCommitAndPush(target.filePath);
  console.log(`[OK] Posted to Facebook. fb_post_id=${result.id || "unknown"}`);
})();


