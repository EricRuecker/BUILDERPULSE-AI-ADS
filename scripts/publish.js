import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const POSTS_DIR = "posts";
const FB_PAGE_ID = process.env.FB_PAGE_ID || "";
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || "";

// Hard fail early if secrets are missing (prevents confusing Meta errors)
if (!FB_PAGE_ID) throw new Error("Missing FB_PAGE_ID secret");
if (!FB_PAGE_ACCESS_TOKEN) throw new Error("Missing FB_PAGE_ACCESS_TOKEN secret");

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f))
    .sort();
}

function parseFrontMatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return { meta: {}, body: text };

  let i = 1;
  const meta = {};
  for (; i < lines.length; i++) {
    if (lines[i] === "---") break;
    const idx = lines[i].indexOf(":");
    if (idx !== -1) meta[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }
  return { meta, body: lines.slice(i + 1).join("\n").trim() };
}

function updateFrontMatter(file, updates) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let end = 1;
  for (; end < lines.length; end++) if (lines[end] === "---") break;

  const meta = {};
  for (let i = 1; i < end; i++) {
    const idx = lines[i].indexOf(":");
    if (idx !== -1) meta[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }

  Object.assign(meta, updates);

  const rebuilt = [
    "---",
    ...Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    "---",
    ...lines.slice(end + 1),
  ].join("\n");

  fs.writeFileSync(file, rebuilt);
}

async function postToFacebook(message) {
  const res = await fetch(`https://graph.facebook.com/v24.0/${FB_PAGE_ID}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      message,
      access_token: FB_PAGE_ACCESS_TOKEN,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.id;
}

function commit(file) {
  execSync(`git config user.name "builderpulse-bot"`);
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git add ${file}`);
  execSync(`git commit -m "Mark post as published"`);
  execSync(`git push`);
}

(async () => {
  const files = listMarkdownFiles(POSTS_DIR);

  for (const file of files) {
    const { meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));

    const platforms = (meta.platforms || "").toLowerCase();
    const isReady = (meta.status || "").toLowerCase() === "ready";
    const wantsFacebook = platforms.includes("facebook");

    if (isReady && wantsFacebook) {
      console.log(`Posting ${file}`);
      const id = await postToFacebook(body);

      updateFrontMatter(file, {
        status: "posted",
        posted_at: new Date().toISOString(),
        fb_post_id: id,
      });

      commit(file);
      console.log("Posted successfully:", id);
      return;
    }
  }

  console.log("No ready Facebook posts found.");
})();
