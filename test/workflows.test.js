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
  it("installs the pipeline's dependencies in site-gate before the CLI summarizes", () => {
    const gate = text("site-pr.yml").split(/^ {2}site-gate:$/m)[1].split(/^ {2}dependabot-merge:$/m)[0];
    const install = gate.indexOf("npm ci --prefix .site-pipeline --ignore-scripts");
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(gate.indexOf("checks/cli.mjs summary"));
  });
  it("passes the site's own params formspreeId to the offline checks", () => {
    const t = text("site-pr.yml");
    expect(t).toContain(`FORMSPREE_ID=$(hugo config --format json | jq -r '.params.formspreeid // ""')`);
    expect(t).toContain('offline --dir public --host "$HOST" --formspree-id "$FORMSPREE_ID"');
  });
  it("requires every live result file in the summary", () => {
    expect(text("site-pr.yml")).toContain("--expect 10-offline,20-negotiate,30-visual,40-lighthouse");
  });
});

describe("site-deploy.yml branch guard", () => {
  it("deploys staging only from the staging branch and production only from main", () => {
    expect(text("site-deploy.yml")).toContain('case "${ENVIRONMENT}:${GITHUB_REF_NAME}" in');
    expect(text("site-deploy.yml")).toContain("staging:staging|production:main) ;;");
  });
});

describe("site-deploy.yml", () => {
  it("confirms promotion through the Cloudflare API, never by fetching the challenged real hostname", () => {
    const t = text("site-deploy.yml");
    expect(t).toContain('assert-active --file after.txt --version "$VERSION"');
    expect(t).not.toContain("https://${TARGET_HOST}");
  });
});

describe("site-weekly.yml", () => {
  it("single-quotes each lychee --exclude regex, because lychee-action evals its args", () => {
    const t = text("site-weekly.yml");
    expect(t).toContain(`args="--exclude '^https?://$(printf '%s' "$HOST" | sed 's/[.]/[.]/g')'"`);
    expect(t).toContain(`for rx in $LINK_EXCLUDE; do args="$args --exclude '$rx'"; done`);
  });
  it("excludes every family domain from the external link check (the zones challenge runners)", () => {
    const t = text("site-weekly.yml");
    for (const host of ["bbking[.]net", "brianbk[.]ing", "jillk[.]ing", "kingfamily[.]info", "masonbk[.]ing", "w3bbk[.]us"]) {
      expect(t).toContain(host);
    }
  });
  it("runs the Formspree canary on the built site and tracks failures in one issue", () => {
    const t = text("site-weekly.yml");
    expect(t).toContain('formspree-canary --dir public --host "$HOST" | tee canary.txt');
    expect(t).toContain("FAILED: ${{ steps.canary.outcome == 'failure' }}");
    expect(t).toContain('issue --title "site-pipeline: weekly Formspree canary failing" --file canary.txt');
  });
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

  it("installs the Worker over https, since runners have no GitHub SSH key", () => {
    const action = readFileSync(join(import.meta.dirname, "..", ".github", "actions", "setup", "action.yml"), "utf8");
    expect(action).toContain('npm install --no-save "git+https://github.com/brianbking/site-pipeline.git#${REF}"');
    expect(action).not.toContain("github:brianbking/site-pipeline");
  });
});