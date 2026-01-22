import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import crypto from "crypto";

const POSTS_DIR = "posts";

const API_KEY = process.env.X_API_KEY || "";
const API_SECRET = process.env.X_API_SECRET || "";
const ACCESS_TOKEN = process.env.X_ACCESS_TOKEN || "";
const ACCESS_SECRET = process.env.X_ACCESS_TOKEN_SECRET || "";

if (!API_KEY) throw new Error("Missing X_API_KEY");
if (!API_SECRET) throw new Error("Missing X_API_SECRET");
if (!ACCESS_TOKEN) throw new Error("Missing X_ACCESS_TOKEN");
if (!ACCESS_SECRET) throw new Error("Missing X_ACCESS_TOKEN_SECRET");

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

  fs.writeFileSync(file, rebuilt, "utf8");
}

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function oauthTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

function buildOAuthHeader({ method, url, extraParams = {} }) {
  const oauthParams = {
    oauth_consumer_key: API_KEY,
    oauth_nonce: oauthNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: oauthTimestamp(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  // Signature base params include oauth params + any request params
  const allParams = { ...oauthParams, ...extraParams };

  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(API_SECRET)}&${percentEncode(ACCESS_SECRET)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };

  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
      .join(", ")
  );
}

async function postToX(text) {
  // X supports both api.x.com and api.twitter.com; use api.x.com for consistency
  const url = "https://api.x.com/2/tweets";
  const method = "POST";

  const auth = buildOAuthHeader({ method, url });

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json?.data?.id;
}

function commit(file) {
  execSync(`git config user.name "builderpulse-bot"`);
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git add "${file}"`);
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
      console.log(`Posting to X: ${file}`);

      // Safety: X max 280 chars (links count differently, but keep it safe)
      const text = body.trim().slice(0, 275);

      const id = await postToX(text);

      updateFrontMatter(file, {
        status: "posted",
        posted_at: new Date().toISOString(),
        x_post_id: id,
      });

      commit(file);
      console.log("Posted successfully:", id);
      return;
    }
  }

  console.log("No ready X posts found.");
})();

