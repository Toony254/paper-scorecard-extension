import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const extensionPath = root;
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const userDataDir = path.join(root, ".tmp-edge-profile");

await fs.rm(userDataDir, { recursive: true, force: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--disable-features=msEdgeSidebarV2"
  ]
});

const page = await context.newPage();
await page.goto("https://arxiv.org/abs/2605.01694", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);

const sw = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 30000 });

const result = await sw.evaluate(async () => {
  const paper = {
    source: "arXiv",
    url: "https://arxiv.org/abs/2605.01694",
    arxivId: "2605.01694",
    pdfUrl: "https://arxiv.org/pdf/2605.01694",
    title: "",
    authors: "",
    abstract: "",
    subjects: "",
    comments: ""
  };
  const settings = {
    reviewPdfOnAbs: true,
    cachePdfText: false,
    enableRelatedWorkSearch: true,
    relatedWorkLimit: 10
  };
  const enriched = await globalThis.__paperScorecardTest.enrichPaperForReview(paper, settings);
  return {
    title: enriched.title,
    authors: enriched.authors,
    abstractLength: enriched.abstract?.length || 0,
    subjects: enriched.subjects,
    pdfTextLength: enriched.pdfText?.length || 0,
    pdfTextStart: enriched.pdfText?.slice(0, 240) || "",
    relatedWorkCount: enriched.relatedWork?.length || 0,
    diagnostics: enriched.diagnostics,
    reviewScope: enriched.reviewScope
  };
});

console.log(JSON.stringify(result, null, 2));

await context.close();
