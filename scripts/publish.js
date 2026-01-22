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
  if (lines[0] !== "---") return { meta: {}, body: text.trim() };

  let i = 1;
  const meta = {};
  for (; i < lines.length; i++) {
    if (lines[i] === "---") break;
    const idx = lines[i].indexOf(":");
    if (idx !== -1) meta[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }

  return { meta, body: lines.slice(i + 1).join("\n").trim() };
}

function parsePlatforms(metaValue) {
  // Accept:
  // - platforms: [facebook, linkedin]
  // - platforms: facebook
  // - platforms: "facebook"
  const raw = (metaValue ?? "").toString().trim().toLowerCase();
  if (!raw) return [];

  // bracket form: [facebook, linkedin]
  const m = raw.match(/^\[(.*)\]$/);
  if (m) {
    return m[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  // single value
  return [raw.replace(/^["']|["']$/g, "")];
}

function isBlankOrTooShort(text) {
  // Prevents the “Aa blank tile” situation
  const cleaned = (text || "").replace(/\u200B/g, "").trim(); // remove zero-width spaces
  return cleaned.length < 20; // adjust threshold if you want
}

function updateFrontMatter(file, updates) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  // If no frontmatter, prepend it
  if (lines[0] !== "---") {
    const rebuilt = [
      "---",
      ...Object.entries(updates).map(([k, v]) => `${k}: ${v}`),
      "---",
      "",
      ...lines,
    ].join("\n");
    fs.writeFileSync(file, rebuilt, "utf8");
    return;
  }

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

  fs.writeFileSync(file, rebuilt, "utf8");
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

  // Safer add (quotes)
  execSync(`git add "${file}"`);

  // Don’t fail workflow if nothing changed
  try {
    execSync(`git diff --staged --quiet`);
    console.log("No changes staged; skipping commit.");
    return;
  } catch {
    // diff exists, continue
  }

  execSync(`git commit -m "Mark post as published"`);
  execSync(`git push`);
}

(async () => {
  const files = listMarkdownFiles(POSTS_DIR);

  for (const file of files) {
    const { meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));

    const status = (meta.status || "").toLowerCase();
    const platforms = parsePlatforms(meta.platforms);
    const wantsFacebook = platforms.includes("facebook");

    if (status === "ready" && wantsFacebook) {
      if (isBlankOrTooShort(body)) {
        throw new Error(
          `Refusing to publish empty/too-short post (prevents blank Aa tile). File: ${file}`
        );
      }

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
