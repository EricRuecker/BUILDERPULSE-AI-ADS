/**
 * Generate 30 LinkedIn "ad-style" posts as Markdown files with front-matter.
 * Output: posts/linkedin/YYYY-MM-DD_linkedin_###.md
 *
 * Run:
 *   node scripts/generate_linkedin_posts.js
 *
 * Optional env:
 *   SITE_URL=https://www.builderpulse.ca
 *   BRAND=BuilderPulseAI
 *   COUNT=30
 */

import fs from "fs";
import path from "path";

const BRAND = process.env.BRAND || "BuilderPulseAI";
const SITE_URL = process.env.SITE_URL || "https://www.builderpulse.ca";
const COUNT = Math.max(1, Math.min(200, parseInt(process.env.COUNT || "30", 10)));

const OUT_DIR = path.join("posts", "linkedin");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uniquePick(arr, used, maxTries = 50) {
  for (let i = 0; i < maxTries; i++) {
    const v = pick(arr);
    if (!used.has(v)) {
      used.add(v);
      return v;
    }
  }
  // Fallback if we exhausted uniqueness
  return pick(arr);
}

function makeFrontMatter({ title, status = "ready", link = SITE_URL }) {
  return `---\nstatus: ${status}\nplatform: linkedin\ntitle: ${title}\nlink: ${link}\n---\n\n`;
}

function sanitizeFilename(s) {
  return s.replace(/[^a-z0-9\-_]+/gi, "_").replace(/_+/g, "_").slice(0, 80);
}

function writePostFile(index, title, body) {
  const date = todayISO();
  const filename = `${date}_linkedin_${pad3(index)}_${sanitizeFilename(title)}.md`;
  const fullpath = path.join(OUT_DIR, filename);
  const fm = makeFrontMatter({ title });
  fs.writeFileSync(fullpath, fm + body.trim() + "\n", "utf8");
  return fullpath;
}

/**
 * Templates
 */
const pains = [
  "Chasing the latest drawing revisions",
  "Copy/pasting notes between PDFs and spreadsheets",
  "Losing time hunting for window/door sizes",
  "Rework because one detail got missed",
  "Estimating and takeoff taking way too long",
  "Crew questions that require digging through plans",
  "Job folders scattered across email/desktop/drive",
  "Version chaos: 'final_final_v7.pdf'",
  "Switching between tools all day just to answer one question",
  "Slow handoffs between office and site",
];

const outcomes = [
  "faster takeoffs",
  "cleaner handoffs",
  "less rework",
  "better visibility on what’s happening",
  "fewer surprises in the field",
  "more consistent estimates",
  "a smoother workflow from plans → production",
  "less time wasted searching",
];

const features = [
  "AI-assisted document search (ask questions, get answers from the drawings)",
  "centralized project workspace for drawings + notes + tasks",
  "PDF viewer workflow built for construction teams",
  "structured info extraction to reduce manual re-typing",
  "simple dashboards that keep jobs organized",
  "an AI agent roadmap for automated panel design and takeoff support",
  "a faster way to find key details (RO sizes, wall types, schedules)",
];

const audiences = [
  "builders",
  "framing contractors",
  "prefab / panel shops",
  "project managers",
  "estimators",
  "site supers",
  "construction owners",
];

const ctas = [
  "Want a demo? Reply “DEMO” and I’ll send a link.",
  "If you want to test it early, DM me and I’ll set you up.",
  "Curious if this fits your workflow? Shoot me a message.",
  "If you want early access, comment “PILOT” and I’ll reach out.",
  "If you’re tired of plan chaos, DM me — I’ll walk you through it.",
];

const hashtags = [
  "#construction #builders #projectmanagement",
  "#constructiontech #builders #estimating",
  "#prefab #framing #construction",
  "#construction #projectmanagement #fieldops",
  "#constructionsoftware #builders #operations",
  "#takeoff #estimating #construction",
];

const hooks = [
  "If you’ve ever lost 30 minutes just finding one detail in the plans…",
  "The fastest way to burn profit on a job? Rework.",
  "Most teams don’t have a labor problem — they have an info problem.",
  "Plan sets are getting bigger. Timelines are not.",
  "Here’s a simple way to cut the time you spend ‘searching’ for answers.",
  "A question I hear all the time from builders:",
  "Hot take: your workflow shouldn’t depend on someone remembering where a PDF is saved.",
];

function templatePainSolutionCTA() {
  const pain = pick(pains);
  const outcome = pick(outcomes);
  const feature = pick(features);

  return {
    title: `${pain} → fixed`,
    body: `
${pick(hooks)}

**Problem:** ${pain}.  
**What we're building:** ${BRAND} — ${feature}.  
**Goal:** ${outcome}, without adding another messy process.

${pick(ctas)}

${pick(hashtags)}
`.trim(),
  };
}

function templateMiniCaseStudy() {
  const aud = pick(audiences);
  const outcome = pick(outcomes);

  return {
    title: `A better workflow for ${aud}`,
    body: `
Quick story.

A lot of ${aud} lose time because project info lives in too many places:
- drawings
- emails
- spreadsheets
- texts

${BRAND} brings that together so you can get answers faster and keep the job moving.

The result: **${outcome}**.

If you want to see the workflow in 5 minutes, DM me.

${pick(hashtags)}
`.trim(),
  };
}

function templateFeatureHighlight() {
  const feature = pick(features);
  const aud = pick(audiences);

  return {
    title: `Feature: ${feature}`,
    body: `
**One feature we’re focused on in ${BRAND}:**
${feature}

Why it matters for ${aud}:
- fewer “where is that?” moments
- less context switching
- faster decisions when the field needs answers

If you want early access, reply “PILOT”.

${pick(hashtags)}
`.trim(),
  };
}

function templateFounderBuildInPublic() {
  const aud = pick(audiences);

  return {
    title: `Building ${BRAND} for ${aud}`,
    body: `
Building in public:

I’m creating ${BRAND} to help ${aud} stop wasting hours hunting through plan sets and notes.

The vision is simple:
✅ projects organized in one place  
✅ plan questions answered faster  
✅ fewer misses that lead to rework

If you’re open to giving feedback (or want to be a pilot user), DM me.

${pick(hashtags)}
`.trim(),
  };
}

function templatePainQuestion() {
  const pain = pick(pains);

  return {
    title: `Question for builders`,
    body: `
Question for construction folks:

What’s your biggest time-waster right now?

For many teams it’s **${pain}**.

I’m building ${BRAND} to reduce that friction — starting with simpler project organization and plan search.

If you want to try it early, comment “DEMO”.

${pick(hashtags)}
`.trim(),
  };
}

const generators = [
  templatePainSolutionCTA,
  templateMiniCaseStudy,
  templateFeatureHighlight,
  templateFounderBuildInPublic,
  templatePainQuestion,
];

function main() {
  ensureDir(OUT_DIR);

  // Try to avoid duplicate titles
  const usedTitles = new Set();

  const written = [];
  for (let i = 1; i <= COUNT; i++) {
    const gen = pick(generators);
    let post = gen();

    // Ensure unique-ish title
    const uniqueTitle = uniquePick([post.title, `${post.title} (${i})`, `${post.title} - ${pick(outcomes)}`], usedTitles);
    post.title = uniqueTitle;

    const file = writePostFile(i, post.title, post.body);
    written.push(file);
  }

  console.log(`✅ Generated ${written.length} LinkedIn posts in: ${OUT_DIR}`);
  console.log(written.slice(0, 5).map(f => `- ${f}`).join("\n") + (written.length > 5 ? `\n...and ${written.length - 5} more` : ""));
}

main();
