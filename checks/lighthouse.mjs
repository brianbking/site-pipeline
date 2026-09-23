// Lighthouse gate: Accessibility >= 95 absolute. Best Practices and SEO must not drop below production,
// and Performance may drop at most 10: preview URLs distort all three (platform noindex, cross-origin
// absolute asset URLs), and the production baseline is measured on a preview URL the same way.
export const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
export const MIN_SCORE = 95;
export const MAX_PERF_DROP = 10;
// Every workers.dev preview URL carries a platform x-robots-tag: noindex, so is-crawlable always fails.
export const LIGHTHOUSE_FLAGS = {
  output: "json",
  onlyCategories: CATEGORIES,
  skipAudits: ["is-crawlable"],
  blockedUrlPatterns: ["*googletagmanager.com*", "*google-analytics.com*", "*cloudflareinsights.com*"],
};

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median 0-100 score per category over several Lighthouse runs (each run: { category: 0-1 }). */
export function medianScores(runs) {
  return Object.fromEntries(CATEGORIES.map((c) => [c, Math.round(median(runs.map((r) => r[c] * 100)))]));
}

/** pages: [{ page, candidate: scores, baseline: scores }] -> failures. */
export function evaluateLighthouse(pages) {
  const failures = [];
  for (const { page, candidate, baseline } of pages) {
    if (candidate.accessibility < MIN_SCORE) {
      failures.push({ check: "lighthouse", file: page, message: `accessibility ${candidate.accessibility} < ${MIN_SCORE}` });
    }
    for (const c of ["best-practices", "seo"]) {
      if (candidate[c] < baseline[c]) {
        failures.push({ check: "lighthouse", file: page, message: `${c} ${candidate[c]} is below production (${baseline[c]})` });
      }
    }
    const drop = baseline.performance - candidate.performance;
    if (drop > MAX_PERF_DROP) {
      failures.push({
        check: "lighthouse",
        file: page,
        message: `performance ${candidate.performance} is ${drop} below production (${baseline.performance}); limit ${MAX_PERF_DROP}`,
      });
    }
  }
  return failures;
}

/** Run Lighthouse `runs` times on `url` (mobile defaults, beacons blocked); returns median scores. */
export async function runLighthouse(url, { runs = 3 } = {}) {
  const { default: lighthouse } = await import("lighthouse");
  const chromeLauncher = await import("chrome-launcher");
  const results = [];
  for (let i = 0; i < runs; i++) {
    const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
    try {
      const { lhr } = await lighthouse(url, { port: chrome.port, ...LIGHTHOUSE_FLAGS });
      results.push(Object.fromEntries(CATEGORIES.map((c) => [c, lhr.categories[c].score ?? 0])));
    } finally {
      await chrome.kill();
    }
  }
  return medianScores(results);
}
