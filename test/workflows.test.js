// Policy checks on the workflow files: properties actionlint cannot know we require.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", ".github", "workflows");
const files = readdirSync(DIR).filter((f) => f.endsWith(".yml"));
const text = (f) => readFileSync(join(DIR, f), "utf8");

describe("every workflow", () => {
  it.each(files)("%s defaults run steps to bash (-o pipefail), so `cmd | tee` cannot hide a failure", (f) => {
    expect(text(f)).toMatch(/^defaults:\n {2}run:\n {4}shell: bash$/m);
  });

  it.each(files)("%s only exposes the Cloudflare token on individual steps, never workflow- or job-wide", (f) => {
    for (const [line] of text(f).matchAll(/^.*CLOUDFLARE_API_TOKEN: \$\{\{.*$/gm)) {
      expect(line).toMatch(/^ {10,}CLOUDFLARE_API_TOKEN/);
    }
  });
});

describe("site-pr.yml", () => {
  it("merges a Dependabot PR only at the head commit its gate checked", () => {
    expect(text("site-pr.yml")).toContain('gh pr merge "$PR_URL" --merge --match-head-commit "$HEAD_SHA"');
  });
  it("requires every live result file in the summary", () => {
    expect(text("site-pr.yml")).toContain("--expect 10-offline,20-negotiate,30-visual,40-lighthouse");
  });
});

describe("site-weekly.yml", () => {
  it("fetches security.txt with curl (the zones challenge Node) and evaluates the file", () => {
    const t = text("site-weekly.yml");
    expect(t).toMatch(/curl .*\.well-known\/security\.txt/);
    expect(t).toContain("security-txt --host \"$HOST\" --file security.txt");
  });
});

describe("setup action", () => {
  it("installs the pipeline's own dependencies without running their install scripts", () => {
    const action = readFileSync(join(import.meta.dirname, "..", ".github", "actions", "setup", "action.yml"), "utf8");
    expect(action).toContain("npm ci --prefix .site-pipeline --ignore-scripts");
  });
});