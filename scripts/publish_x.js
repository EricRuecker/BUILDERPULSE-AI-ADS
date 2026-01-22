import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import OAuth from "oauth-1.0a";
import crypto from "crypto";
import fetch from "node-fetch";

const POSTS_DIR = "posts";

const {
  X_API_KEY,
  X_API_SECRET,
  X_ACCESS_TOKEN,
  X_ACCESS_TOKEN_SECRET,
} = process.env;

// Hard fail early if secrets are missing
if (!X_API_KEY) throw new Error("Missing X_API_KEY");
if (!X_API_SECRET) throw new Error("Missing X_API_SECRET");
if (!X_ACCESS_TOKEN) throw new Error("Missing X_ACCESS_TOKEN");
if (!X_ACCESS_TOKEN_SECRET) throw new Error("Missing X_ACCESS_TOKEN_SECRET");

// OAuth 1.0a setup
const oauth = new OAuth({
  consumer: { key: X_API_KEY, secret: X_API_SECRET },
  signature_method: "HMAC-SHA1",
  hash_function(base_string, key) {
    return crypto.createHmac("sha1", key).update(base_string).digest("base64");
  },
});

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
    if (idx !== -1) {
      meta[lines[i].slice(0, idx).trim()] = lines[i]
        .slice(idx + 1)
        .trim();
    }
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

async function postToX(text) {
  const url = "https://api.x.com/2/tweets";

  const requestData = {
    url,
    method: "POST",
    data: { text },
  };

  const token = {
    key: X_ACCESS_TOKEN,
    secret: X_ACCESS_TOKEN_SECRET,
  };

  const headers = oauth.toHeader(oauth.authorize(requestData, token));
  headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.data.id;
}

function commit(file) {
  execSync(`git config user.name "builderpulse-bot"`);
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git add ${file}`);
  execSync(`git commit -m "Mark X post as published"`);
  execSync(`git push`);
}

(async () => {
  const files = listMarkdownFiles(POSTS_DIR);

  for (const file of files) {
    const { meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));

    const platforms = (meta.platforms || "").toLowerCase();
    const isReady = (meta.status || "").toLowerCase() === "ready";
    const wantsX = platforms.includes("x");

    if (isReady && wantsX) {
      console.log(`Posting X: ${file}`);

      const id = await postToX(body);

      updateFrontMatter(file, {
        status: "posted",
        x_post_id: id,
        posted_at: new Date().toISOString(),
      });

      commit(file);
      console.log("X post published:", id);
      return;
    }
  }

  console.log("No ready X posts found.");
})();
