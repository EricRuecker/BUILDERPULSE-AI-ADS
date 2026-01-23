import fs from "fs";
import path from "path";

const POSTS_DIR = "posts/instagram";
const COUNT = 30;

// DIRECT RAW IMAGE URL (required for IG)
const IMAGE_URL =
  "https://raw.githubusercontent.com/EricRuecker/BUILDERPULSE-AI-ADS/main/assets/instagram/builderpulse-logo-new.png";

function pad(n) {
  return String(n).padStart(2, "0");
}

function timestamp(d = new Date()) {
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCaption() {
  const hooks = [
    "Blueprints in. Answers out.",
    "Stop digging through drawings.",
    "Construction admin — simplified.",
    "Faster takeoffs start here.",
    "Your plans deserve better tools.",
  ];

  const value = [
    "Upload drawings, extract key details, and keep projects organized automatically.",
    "Turn PDFs into searchable project data your whole team can use.",
    "Spend less time searching plans and more time building.",
    "AI-powered document handling built for real construction workflows.",
    "One platform to manage drawings, takeoffs, and project info.",
  ];

  const cta = [
    "Try it at www.builderpulse.ca",
    "See how it works → www.builderpulse.ca",
    "Get started today: www.builderpulse.ca",
    "Built for builders. Learn more at www.builderpulse.ca",
  ];

  const tags = [
    "#construction #builders #blueprints #takeoff #builderpulseai",
    "#constructiontech #contractorlife #estimating #builderpulseai",
    "#framing #prefab #constructionsoftware #builderpulseai",
  ];

  return `${pick(hooks)} ${pick(value)} ${pick(cta)}\n\n${pick(tags)}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writePost(i) {
  ensureDir(POSTS_DIR);

  const name = `${timestamp()}-builderpulse-${pad(i + 1)}.md`;
  const filePath = path.join(POSTS_DIR, name);

  const caption = generateCaption();

  const content = `---
caption: ${JSON.stringify(caption)}
image_url: ${JSON.stringify(IMAGE_URL)}
---
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log("✅ Created:", filePath);
}

for (let i = 0; i < COUNT; i++) {
  writePost(i);
}

console.log(`\n🎉 Done. Generated ${COUNT} Instagram posts in ${POSTS_DIR}`);
