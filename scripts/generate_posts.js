/**
 * Generate N Facebook post markdown files in /posts with unique ids + dates.
 *
 * Usage:
 *   node scripts/generate_posts.js 30
 *
 * Optional env:
 *   START_DATE=2026-01-23   (defaults to tomorrow in local time)
 *   PREFIX=fb              (defaults to fb)
 */

const fs = require("fs");
const path = require("path");

const N = parseInt(process.argv[2] || "30", 10);
if (!Number.isFinite(N) || N < 1) {
  console.error("Usage: node scripts/generate_posts.js <count>");
  process.exit(1);
}

const POSTS_DIR = path.join(process.cwd(), "posts");
fs.mkdirSync(POSTS_DIR, { recursive: true });

function pad3(n) {
  return String(n).padStart(3, "0");
}

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseStartDate() {
  const s = process.env.START_DATE;
  if (s) {
    const d = new Date(`${s}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
    throw new Error(`Invalid START_DATE: ${s}`);
  }
  // default: tomorrow (local)
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function safeSlug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "post";
}

const prefix = (process.env.PREFIX || "fb").toLowerCase();
const startDate = parseStartDate();

for (let i = 0; i < N; i++) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);

  const num = i + 1;
  const id = `${prefix}-${pad3(num)}`;
  const dateStr = toYMD(d);

  // You can customize this topic list (or leave it generic).
  const topic = `builderpulse-update-${pad3(num)}`;
  const slug = safeSlug(topic);

  const filename = `${dateStr}-${slug}.md`;
  const filePath = path.join(POSTS_DIR, filename);

  if (fs.existsSync(filePath)) {
    console.log(`Skip (exists): ${filename}`);
    continue;
  }

  const body = `---
id: ${id}
platforms: [facebook]
status: ready
---

🚀 BuilderPulseAI is live.

Replace this text with your post #${pad3(num)} content.
👉 https://www.builderpulse.ca
`;

  fs.writeFileSync(filePath, body, "utf8");
  console.log(`Created: ${filename}`);
}

console.log("Done.");
