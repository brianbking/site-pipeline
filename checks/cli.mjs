#!/usr/bin/env node
// Single entry point the workflows call:  node checks/cli.mjs <command> [--options]
// Every command prints a human report, optionally writes --json results, and exits 1 on failure.
import { parseArgs } from "node:util";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OFFLINE_CHECKS } from "./offline.mjs";
import { checkNegotiationLive, checkSecurityTxt, checkSmoke, evaluateSecurityTxt } from "./live.mjs";
import { evaluateLighthouse, runLighthouse } from "./lighthouse.mjs";
import { VIEWPORTS, capture, comparePngs, evaluateVisual } from "./visual.mjs";
import { execFileSync } from "node:child_process";
import { issueAction, parseActiveVersion, parseVersionUpload, renderSummary, versionPreviewUrl } from "./lib/ci.mjs";

const [command, ...rest] = process.argv.slice(2);
const { values: opt } = parseArgs({
  args: rest,
  options: {
    dir: { type: "string", default: "public" },
    host: { type: "string" },
    base: { type: "string" },
    baseline: { type: "string" },
    candidate: { type: "string" },
    pages: { type: "string", default: '["/"]' },
    mask: { type: "string", default: "[]" },
    out: { type: "string", default: "gate-out" },
    json: { type: "string" },
    approved: { type: "boolean", default: false },
    staging: { type: "boolean", default: false },
    worker: { type: "string" },
    file: { type: "string" },
    "active-file": { type: "string" },
    results: { type: "string" },
    expect: { type: "string", default: "" },
    title: { type: "string" },
    failing: { type: "boolean", default: false },
  },
});

function report(name, failures, status = failures.length ? "fail" : "pass") {
  console.log(`${status.toUpperCase().padEnd(8)} ${name}`);
  for (const f of failures) console.log(`         ${f.file}: ${f.message}`);
  const result = { name, status, failures };
  if (opt.json) writeFileSync(opt.json, JSON.stringify([result], null, 2));
  process.exit(status === "fail" ? 1 : 0);
}

/** Record a failure for a command that could not run, so the gate never mistakes silence for a pass. */
function writeFailure(message) {
  if (opt.json) writeFileSync(opt.json, JSON.stringify([{ name: command, status: "fail", failures: [{ file: command, message }] }], null, 2));
}

// versions upload prints no preview URL when the Worker-level setting is off; config alone does not turn it on.
const noPreviewUrl = (worker) =>
  `no preview URL in the upload output - enable Preview URLs for Worker "${worker}" (dashboard: Settings > Domains & Routes)`;

const need = (...keys) => {
  const missing = keys.filter((k) => !opt[k]);
  if (missing.length) {
    console.error(`${command}: missing --${missing.join(", --")}`);
    writeFailure(`missing --${missing.join(", --")} (did an earlier step fail?)`);
    process.exit(2);
  }
};

try {
switch (command) {
  case "offline": {
    need("host");
    const failures = [];
    for (const check of Object.values(OFFLINE_CHECKS)) failures.push(...(await check({ dir: opt.dir, host: opt.host })));
    report("offline checks", failures);
    break;
  }
  case "negotiate": {
    need("base");
    report("markdown negotiation", await checkNegotiationLive(opt.base));
    break;
  }
  case "smoke": {
    need("base");
    report(`smoke (${opt.staging ? "staging" : "production"})`, await checkSmoke(opt.base, { pages: JSON.parse(opt.pages), staging: opt.staging }));
    break;
  }
  case "security-txt": {
    // --file: a copy fetched with curl (the zones challenge Node's fetch); otherwise fetch it here.
    need("host");
    report("security.txt", opt.file ? evaluateSecurityTxt(readFileSync(opt.file, "utf8"), opt.host) : await checkSecurityTxt(opt.host));
    break;
  }
  case "visual": {
    need("baseline", "candidate");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const results = [];
    mkdirSync(opt.out, { recursive: true });
    try {
      for (const page of JSON.parse(opt.pages)) {
        for (const [viewport, size] of Object.entries(VIEWPORTS)) {
          const mask = JSON.parse(opt.mask);
          const a = await capture(browser, new URL(page, opt.baseline).toString(), size, mask);
          const b = await capture(browser, new URL(page, opt.candidate).toString(), size, mask);
          const cmp = comparePngs(a, b);
          const slug = `${page.replace(/[^a-z0-9]+/gi, "_") || "_"}-${viewport}`;
          writeFileSync(join(opt.out, `${slug}-baseline.png`), a);
          writeFileSync(join(opt.out, `${slug}-candidate.png`), b);
          if (cmp.diff) writeFileSync(join(opt.out, `${slug}-diff.png`), cmp.diff);
          results.push({ page, viewport, ratio: cmp.ratio, reason: cmp.reason });
          console.log(`         ${page} ${viewport}: ${(cmp.ratio * 100).toFixed(3)}%`);
        }
      }
    } finally {
      await browser.close();
    }
    const { status, failures } = evaluateVisual(results, { approved: opt.approved });
    report("visual regression", failures, status);
    break;
  }
  case "lighthouse": {
    need("baseline", "candidate");
    const pages = [];
    for (const page of JSON.parse(opt.pages)) {
      const baseline = await runLighthouse(new URL(page, opt.baseline).toString());
      const candidate = await runLighthouse(new URL(page, opt.candidate).toString());
      console.log(`         ${page}: candidate ${JSON.stringify(candidate)} baseline ${JSON.stringify(baseline)}`);
      pages.push({ page, candidate, baseline });
    }
    report("lighthouse", evaluateLighthouse(pages));
    break;
  }
  case "preview-urls": {
    // --file: `wrangler versions upload` output; --active-file: `wrangler deployments status` output.
    need("file", "active-file", "worker");
    const upload = parseVersionUpload(readFileSync(opt.file, "utf8"));
    const candidate = upload.aliasUrl ?? upload.previewUrl;
    if (!candidate) throw new Error(noPreviewUrl(opt.worker));
    const baseline = versionPreviewUrl(candidate, opt.worker, parseActiveVersion(readFileSync(opt["active-file"], "utf8")));
    console.log(`version=${upload.versionId}\ncandidate=${candidate}\nbaseline=${baseline}`);
    break;
  }
  case "active-version": {
    // --file: `wrangler deployments status` output. Prints PREVIOUS=<id> for $GITHUB_ENV.
    need("file");
    console.log(`PREVIOUS=${parseActiveVersion(readFileSync(opt.file, "utf8"))}`);
    break;
  }
  case "version-info": {
    // --file: `wrangler versions upload` output. Prints VERSION= and PREVIEW= for $GITHUB_ENV.
    need("file", "worker");
    const upload = parseVersionUpload(readFileSync(opt.file, "utf8"));
    if (!upload.previewUrl) throw new Error(noPreviewUrl(opt.worker));
    console.log(`VERSION=${upload.versionId}\nPREVIEW=${versionPreviewUrl(upload.previewUrl, opt.worker, upload.versionId)}`);
    break;
  }
  case "issue": {
    // One tracking issue per scheduled check: create / comment while failing, close when it passes.
    need("title");
    const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim();
    const open = JSON.parse(gh("issue", "list", "--state", "open", "--search", `"${opt.title}" in:title`, "--json", "number,title"))
      .find((i) => i.title === opt.title)?.number ?? null;
    const body = opt.file ? readFileSync(opt.file, "utf8") : `See ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    const action = issueAction(open, opt.failing);
    if (action === "create") gh("issue", "create", "--title", opt.title, "--body", body);
    if (action === "comment") gh("issue", "comment", String(open), "--body", body);
    if (action === "close") gh("issue", "close", String(open), "--comment", "Passing again.");
    console.log(`issue: ${action}${open ? ` #${open}` : ""}`);
    break;
  }
  case "summary": {
    // --results: directory of result JSON files written by the other commands.
    need("results");
    const sections = readdirSync(opt.results)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .flatMap((f) => JSON.parse(readFileSync(join(opt.results, f), "utf8")));
    // --expect: result files every run must produce. A missing one means that check crashed or never ran.
    const present = new Set(readdirSync(opt.results));
    const missing = opt.expect.split(",").filter(Boolean).filter((name) => !present.has(`${name}.json`));
    if (missing.length) {
      sections.unshift({
        name: "missing results",
        status: "fail",
        failures: missing.map((name) => ({ file: `${name}.json`, message: "no result - the check crashed or never ran" })),
      });
    }
    const md = renderSummary(sections);
    writeFileSync(join(opt.results, "summary.md"), md);
    console.log(md);
    process.exit(sections.some((s) => s.status === "fail") ? 1 : 0);
    break;
  }
  default:
    console.error(`unknown command "${command}"`);
    process.exit(2);
}
} catch (e) {
  console.error(e);
  writeFailure(`${command} crashed: ${e.message}`);
  process.exit(1);
}
