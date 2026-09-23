import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { comparePngs, evaluateVisual, MAX_DIFF_RATIO } from "../checks/visual.mjs";
import { evaluateLighthouse, median, medianScores } from "../checks/lighthouse.mjs";
import {
  issueAction,
  parseActiveVersion,
  parseVersionUpload,
  renderSummary,
  versionPreviewUrl,
} from "../checks/lib/ci.mjs";

function png(width, height, paint = () => [255, 255, 255]) {
  const img = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = paint(x, y);
      img.data.set([r, g, b, 255], i);
    }
  }
  return PNG.sync.write(img);
}

describe("comparePngs / evaluateVisual", () => {
  it("reports 0 for identical images", () => {
    expect(comparePngs(png(100, 100), png(100, 100)).ratio).toBe(0);
  });
  it("reports the changed-pixel ratio", () => {
    const changed = png(100, 100, (x, y) => (x < 10 && y < 10 ? [0, 0, 0] : [255, 255, 255]));
    const { ratio, diff } = comparePngs(png(100, 100), changed);
    expect(ratio).toBeCloseTo(0.01);
    expect(diff).toBeInstanceOf(Buffer);
  });
  it("treats a size change as a full change", () => {
    expect(comparePngs(png(100, 100), png(100, 120))).toMatchObject({ ratio: 1, reason: "size changed 100x100 -> 100x120" });
  });
  it("passes at the threshold, fails above it, and the label turns fail into approved", () => {
    const at = [{ page: "/", viewport: "mobile", ratio: MAX_DIFF_RATIO }];
    const over = [{ page: "/", viewport: "mobile", ratio: 0.002, reason: null }];
    expect(evaluateVisual(at).status).toBe("pass");
    expect(evaluateVisual(over)).toEqual({ status: "fail", failures: [{ check: "visual", file: "/ (mobile)", message: "0.20% of pixels changed" }] });
    expect(evaluateVisual(over, { approved: true }).status).toBe("approved");
  });
});

describe("lighthouse gate", () => {
  const scores = (performance, accessibility, bp, seo) => ({ performance, accessibility, "best-practices": bp, seo });
  it("takes medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(medianScores([{ performance: 0.5, accessibility: 1, "best-practices": 1, seo: 0.9 }, { performance: 0.7, accessibility: 1, "best-practices": 1, seo: 0.9 }, { performance: 0.9, accessibility: 1, "best-practices": 1, seo: 0.9 }]))
      .toEqual(scores(70, 100, 100, 90));
  });
  it("passes at the edges: 95 and a 10-point drop", () => {
    expect(evaluateLighthouse([{ page: "/", candidate: scores(80, 95, 95, 95), baseline: scores(90, 100, 100, 100) }])).toEqual([]);
  });
  it("fails below 95 and on a drop over 10", () => {
    const found = evaluateLighthouse([{ page: "/", candidate: scores(79, 94, 100, 100), baseline: scores(90, 100, 100, 100) }]);
    expect(found.map((f) => f.message)).toEqual(["accessibility 94 < 95", "performance 79 is 11 below production (90); limit 10"]);
  });
  it("never fails performance on its own absolute value", () => {
    expect(evaluateLighthouse([{ page: "/", candidate: scores(40, 100, 100, 100), baseline: scores(45, 100, 100, 100) }])).toEqual([]);
  });
});

describe("wrangler output parsing", () => {
  // Shape of wrangler 4 output; re-confirmed against real output in the pilot (Task 12).
  const upload = [
    "Total Upload: 0.51 KiB / gzip: 0.30 KiB",
    "Worker Startup Time: 10 ms",
    "Uploaded w3bbk (2.10 sec)",
    "Worker Version ID: 5d0e4a1b-1111-2222-3333-444455556666",
    "Version Preview URL: https://5d0e4a1b-w3bbk.brianbking.workers.dev",
    "Version Preview Alias URL: https://pr-7-w3bbk.brianbking.workers.dev",
  ].join("\n");

  it("reads the version ID and preview URLs", () => {
    expect(parseVersionUpload(upload)).toEqual({
      versionId: "5d0e4a1b-1111-2222-3333-444455556666",
      previewUrl: "https://5d0e4a1b-w3bbk.brianbking.workers.dev",
      aliasUrl: "https://pr-7-w3bbk.brianbking.workers.dev",
    });
  });
  it("throws when there is no version ID", () => {
    expect(() => parseVersionUpload("Uploaded w3bbk")).toThrow(/Worker Version ID/);
  });
  it("finds the version at 100%", () => {
    expect(parseActiveVersion("Version(s):  (100%) 9f8e7d6c-1111-2222-3333-444455556666\n   Created: x")).toBe("9f8e7d6c-1111-2222-3333-444455556666");
    expect(() => parseActiveVersion("(90%) 9f8e7d6c-1111-2222-3333-444455556666\n(10%) 1f8e7d6c-1111-2222-3333-444455556666")).toThrow(/no single version at 100%/);
  });
  it("builds the production version's preview URL from any preview URL", () => {
    expect(versionPreviewUrl("https://pr-7-w3bbk.brianbking.workers.dev", "w3bbk", "9f8e7d6c-1111-2222-3333-444455556666"))
      .toBe("https://9f8e7d6c-w3bbk.brianbking.workers.dev");
    expect(() => versionPreviewUrl("https://example.com", "w3bbk", "9f8e7d6c")).toThrow(/subdomain/);
  });
});

describe("issueAction", () => {
  it.each([
    [null, true, "create"],
    [12, true, "comment"],
    [12, false, "close"],
    [null, false, "none"],
  ])("open=%s failing=%s -> %s", (open, failing, action) => {
    expect(issueAction(open, failing)).toBe(action);
  });
});

describe("renderSummary", () => {
  it("renders a red summary with the failing file and message", () => {
    const md = renderSummary([
      { name: "offline", status: "pass", failures: [] },
      { name: "visual", status: "fail", failures: [{ file: "/ (mobile)", message: "0.20% of pixels changed" }] },
    ]);
    expect(md.startsWith("<!-- site-gate -->\n## ❌ site-gate")).toBe(true);
    expect(md).toContain("| visual | ❌ fail |");
    expect(md).toContain("- `/ (mobile)`: 0.20% of pixels changed");
  });
});
