// Lighthouse gate: A11y / Best Practices / SEO >= 95 absolute; Performance relative to production.
export const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
export const MIN_SCORE = 95;
export const MAX_PERF_DROP = 10;

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
    for (const c of ["accessibility", "best-practices", "seo"]) {
      if (candidate[c] < MIN_SCORE) {
        failures.push({ check: "lighthouse", file: page, message: `${c} ${candidate[c]} < ${MIN_SCORE}` });
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
      const { lhr } = await lighthouse(url, {
        port: chrome.port,
        output: "json",
        onlyCategories: CATEGORIES,
        blockedUrlPatterns: ["*googletagmanager.com*", "*google-analytics.com*", "*cloudflareinsights.com*"],
      });
      results.push(Object.fromEntries(CATEGORIES.map((c) => [c, lhr.categories[c].score ?? 0])));
    } finally {
      await chrome.kill();
    }
  }
  return medianScores(results);
}
