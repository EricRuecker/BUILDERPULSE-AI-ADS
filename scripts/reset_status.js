/**
 * Reset all post statuses from "posted" back to "ready"
 * Also removes posted_at and any *_post_id fields.
 *
 * Usage:
 *   node scripts/reset_status.js
 */

const fs = require("fs");
const path = require("path");

const POSTS_DIR = path.join(process.cwd(), "posts");

function processFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");

  // Only process markdown with frontmatter
  if (!content.startsWith("---")) return false;

  const parts = content.split("---");
  if (parts.length < 3) return false;

  let frontmatter = parts[1];
  const body = parts.slice(2).join("---");

  if (!frontmatter.includes("status: posted")) return false;

  // Change status
  frontmatter = frontmatter.replace(
    /status:\s*posted/g,
    "status: ready"
  );

  // Remove posted_at
  frontmatter = frontmatter.replace(
    /^posted_at:.*\n?/gm,
    ""
  );

  // Remove fb_post_id, ig_media_id, tweet_id, etc
  frontmatter = frontmatter.replace(
    /^.*_post_id:.*\n?/gm,
    ""
  );

  const updated = `---${frontmatter}---${body}`;
  fs.writeFileSync(filePath, updated, "utf8");

  return true;
}

function walk(dir) {
  let changed = 0;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      changed += walk(full);
    } else if (file.endsWith(".md")) {
      if (processFile(full)) {
        console.log(`Reset: ${full}`);
        changed++;
      }
    }
  }

  return changed;
}

if (!fs.existsSync(POSTS_DIR)) {
  console.log("No posts directory found.");
  process.exit(0);
}

const total = walk(POSTS_DIR);
console.log(`Done. Files reset: ${total}`);
