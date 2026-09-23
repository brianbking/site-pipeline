// Visual regression: screenshot each page on baseline and candidate, diff with pixelmatch.
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1366, height: 900 },
};
export const MAX_DIFF_RATIO = 0.001; // > 0.1 % of pixels changed on a page -> needs the label
// Third-party beacons: blocked so CI never pollutes analytics and never flakes on them.
export const BLOCKED_HOSTS = ["www.googletagmanager.com", "www.google-analytics.com", "static.cloudflareinsights.com"];

/** Compare two PNG buffers. Different dimensions count as a full-page change. */
export function comparePngs(baselinePng, candidatePng) {
  const a = PNG.sync.read(baselinePng);
  const b = PNG.sync.read(candidatePng);
  if (a.width !== b.width || a.height !== b.height) {
    return { ratio: 1, diff: null, reason: `size changed ${a.width}x${a.height} -> ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  return { ratio: changed / (a.width * a.height), diff: PNG.sync.write(diff), reason: null };
}

/** Full-page screenshot of `url` with motion off, beacons blocked, and `mask` selectors blanked. */
export async function capture(browser, url, viewport, mask = []) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.route("**/*", (route) =>
    BLOCKED_HOSTS.includes(new URL(route.request().url()).hostname) ? route.abort() : route.continue(),
  );
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  const png = await page.screenshot({ fullPage: true, animations: "disabled", mask: mask.map((s) => page.locator(s)) });
  await context.close();
  return png;
}

/** Judge a set of comparisons. `approved` is the approved-visual-change label. */
export function evaluateVisual(results, { approved = false } = {}) {
  const over = results.filter((r) => r.ratio > MAX_DIFF_RATIO);
  return {
    status: over.length === 0 ? "pass" : approved ? "approved" : "fail",
    failures: over.map((r) => ({
      check: "visual",
      file: `${r.page} (${r.viewport})`,
      message: r.reason || `${(r.ratio * 100).toFixed(2)}% of pixels changed`,
    })),
  };
}
