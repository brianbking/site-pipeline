# site-pipeline Wave 3 — KingFamily Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the spec's Formspree checks to site-pipeline and release them as `v1.1.0`. That means an offline check on every PR and a real canary submission every week. Then move kingfamily.info from Workers Builds (a divergent `src/worker.js` that never negotiates) to GitHub Actions → Workers on `v1.1.0`, with PR previews, `staging.kingfamily.info` and markdown negotiation live.

**Architecture:** Part A is new pipeline code, the only new code since `v1.0.0`. The spec deferred Formspree to this wave (Revisions → Wave split). The Formspree ID lives in exactly one place, the site's own `params.toml` `formspreeId`. The PR workflow reads it with `hugo config` and checks the built form against it. The weekly canary takes the ID from the built form, so it always tests what is deployed. KingFamily and BrianBK.ing both use `mgeggkzw` today (same destination, Brian 2026-09-23). They can diverge later by editing one line in either site's `params.toml`, and nothing in site-pipeline changes. Part B is a port of the wave 2 configuration (`.agents/plans/2026-09-23-site-pipeline-wave2-bbking.md`) with `bbking` → `kingfamily`. Part B also has one accessibility task, because KingFamily's templates fail the A11y gate.

**Tech Stack:** Node 24, Vitest 5, GitHub Actions (`jq` preinstalled on `ubuntu-latest`); Hugo extended 0.162.0 in CI (local is 0.166.0); Wrangler 4.137+; Lighthouse 13 (local baseline).

**Spec:** `.agents/specs/2026-09-23-workers-ci-pipeline-design.md`. Its **Revisions** table binds where it disagrees with the text above it. Findings: `.agents/findings/2026-09-23-w3bbk-pilot.md`, including its Wave 2 section.

## Global Constraints

- New release **`v1.1.0`** (minor: a new check and a new weekly step, no input changes). KingFamily pins `v1.1.0` in all three workflow files **and** `package.json`. W3BBK and BBKing move from `v1.0.0` via Dependabot.
- `package.json` dependency form is `git+https://github.com/brianbking/site-pipeline.git#v1.1.0`. `npm install` rewrites it to `github:`; re-edit it and check with `Select-String`.
- Production wrangler commands pass `--env=""` (`--env=` in YAML).
- Secrets never go in files or the conversation. Set them with `gh secret set NAME --body (op read …).Trim()`, **never** by piping `op read` into `gh`: under PS 5.1 the pipe stores a trailing CRLF (wave 2 finding). Vault `King Family - Brian`, item `site-pipeline-king-family`, fields `credential` / `account_id`.
- **Claude never runs `git push`** (hard-denied). Every push step is *Brian runs*. PR merges, dashboard changes, tags, branch deletes and the manual Formspree submission happen only after Brian says go for that step.
- `wrangler` commands that need `CLOUDFLARE_API_TOKEN` (the staging bootstrap, `versions upload`) run in Brian's own terminal (wave 2 finding).
- Commits: Conventional Commits, summary ≤ 50 characters (measure with `'<summary>'.Length`), no `Co-Authored-By` trailer, stage by explicit path, never `git add -A`.
- Windows host: run commands through the PowerShell tool unless a step says Bash.

## Review Focus

1. **Formspree may refuse the canary.** The contact page loads `https://www.google.com/recaptcha/api.js`, which suggests reCAPTCHA was once turned on for form `mgeggkzw`. If it's still on, every JSON submission from CI fails, and the weekly canary opens an issue on its first run. Task 3 Step 1 sends one real submission before anything depends on it.
2. **A site with no form must stay green.** W3BBK and BBKing have no `formspreeId` and no form. The offline check must pass with `--formspree-id ""`, and the canary must report `SKIP` and exit 0. Otherwise the `v1.1.0` Dependabot PRs go red on both live sites. This is pinned by the "no form and no formspreeId" test in Task 1 and the `SKIP` run in Task 2 Step 5.
3. **An empty or missing param renders `https://formspree.io/f/`.** Hugo outputs an empty string for a missing `.Site.Params.formspreeId`, so the form silently posts nowhere. This is pinned by the "empty action" test in Task 1.
4. **The A11y gate fails on every KingFamily page today:** 93 / 85 / 92 locally on 2026-09-23 (home / contact / referrals). The first PR would go red. Task 4 brings all three to 100, measured on a scratch copy.
5. **The staging custom domain collides with existing DNS.** `kingfamily.info` has a **wildcard** DNS record (any subdomain resolves), and `staging.kingfamily.info` already redirects to Cloudflare Access. A custom domain should take precedence over a wildcard, but that hasn't been checked. An exact-name record would make `wrangler deploy --env staging` fail. Task 6 Step 4 is where this shows up; stop there rather than delete DNS records.

---

## File Structure

`P:\Family_Websites\site-pipeline\` on branch `feature/formspree-checks`:

| File | Change | Responsibility |
|---|---|---|
| `checks/offline.mjs` | Modify | `formspreeForms()`, `checkFormspree()`, registered as `formspree` |
| `checks/live.mjs` | Modify | `checkFormspreeCanary()` |
| `checks/cli.mjs` | Modify | `--formspree-id` for `offline`; new `formspree-canary` command |
| `.github/workflows/site-pr.yml` | Modify | Offline step passes `params.formspreeid` |
| `.github/workflows/site-weekly.yml` | Modify | Canary step + tracking issue |
| `test/formspree.test.js` | Create | Offline check + canary tests |
| `test/workflows.test.js` | Modify | Pin the two workflow changes |
| `README.md`, `package.json` | Modify | Document Formspree; `version` 1.1.0 |

`P:\Family_Websites\KingFamily\` on branch `feature/workers-ci`: the same file set as wave 2, plus the Task 4 accessibility files (`layouts/partials/home/header.html`, `layouts/partials/home/members.html`, `layouts/contact/single.html`, `layouts/referrals/single.html`, `layouts/partials/contact-form.html`, `assets/sass/styles.scss`, `assets/sass/dark/styles.scss`).

---

## Part A — site-pipeline v1.1.0

### Task 1: Formspree offline check

**Files:**
- Create: `P:\Family_Websites\site-pipeline\test\formspree.test.js`
- Modify: `checks/offline.mjs` (insert before `export const OFFLINE_CHECKS`, register), `checks/cli.mjs` (`offline` case + option), `.github/workflows/site-pr.yml` (Offline checks step), `test/workflows.test.js`

**Interfaces:**
- Produces: `formspreeForms(dir) → [{ file, action, id: string|null, open, body }]` and `checkFormspree({ dir, formspreeId }) → failures[]`, both exported from `checks/offline.mjs`. The CLI option is `--formspree-id <string>`. `formspreeId === undefined` skips the ID comparison, while `""` means "this site has no ID".

- [ ] **Step 1: Branch**

```powershell
Set-Location P:\Family_Websites\site-pipeline
git status --short --branch   # expect: ## main...origin/main, nothing else
git switch -c feature/formspree-checks
npx vitest run                # baseline: Tests 127 passed (127)
```

- [ ] **Step 2: Write the failing tests.** Create `test/formspree.test.js` (Task 2 appends the canary tests):

```js
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkFormspree, formspreeForms } from "../checks/offline.mjs";

// The contact form as Hugo --minify writes it: bare attribute values, boolean `required`.
const form = ({ action = "https://formspree.io/f/abc123", method = "post", email = "<input type=email name=email required>" } = {}) =>
  `<!doctype html><title>Contact</title><form id=fs-frm action=${action} method=${method} class=text-right>` +
  `<input type=text name=name required>${email}<textarea rows=5 name=message placeholder="What's up?" required></textarea>` +
  `<input type=hidden name=subject value="Contact Form submission"><button type=submit>Send</button></form>`;
const CSP = "/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'\n";

const dirs = [];
function build(files) {
  const dir = mkdtempSync(join(tmpdir(), "sp-formspree-"));
  dirs.push(dir);
  for (const [rel, body] of Object.entries({ "index.html": "<!doctype html><title>Home</title>", _headers: CSP, ...files })) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("checkFormspree", () => {
  it("passes a minified contact form that posts to the site's own ID", () => {
    expect(checkFormspree({ dir: build({ "contact/index.html": form() }), formspreeId: "abc123" })).toEqual([]);
  });

  it("passes a site with no form and no formspreeId (W3BBK, BBKing)", () => {
    expect(checkFormspree({ dir: build({}), formspreeId: "" })).toEqual([]);
  });

  it("flags a form posting to an ID other than the site's params formspreeId", () => {
    expect(checkFormspree({ dir: build({ "contact/index.html": form() }), formspreeId: "zzz999" })).toEqual([
      { check: "formspree", file: "contact/index.html", message: 'form posts to abc123, but params formspreeId is "zzz999"' },
    ]);
  });

  it("flags the empty action Hugo renders when formspreeId is missing", () => {
    const dir = build({ "contact/index.html": form({ action: "https://formspree.io/f/" }) });
    expect(checkFormspree({ dir, formspreeId: "" })).toEqual([
      { check: "formspree", file: "contact/index.html", message: 'form action "https://formspree.io/f/" is not https://formspree.io/f/<id>' },
    ]);
  });

  it("flags a formspreeId that no built page uses", () => {
    expect(checkFormspree({ dir: build({}), formspreeId: "abc123" })).toEqual([
      { check: "formspree", file: "params.formspreeId", message: '"abc123" is set but no built page has a Formspree form' },
    ]);
  });

  it("flags a GET form and an optional email field", () => {
    const dir = build({ "contact/index.html": form({ method: "get", email: "<input type=email name=email>" }) });
    expect(checkFormspree({ dir, formspreeId: "abc123" }).map((f) => f.message)).toEqual([
      "form method must be post",
      'needs a required <input type="email" name="email">',
    ]);
  });

  it("flags a CSP form-action that blocks Formspree, and names the _headers line", () => {
    const dir = build({ "contact/index.html": form(), _headers: "/*\n  Content-Security-Policy: default-src 'self'; form-action 'self'\n" });
    expect(checkFormspree({ dir, formspreeId: "abc123" })).toEqual([
      { check: "formspree", file: "_headers:2", message: `CSP form-action "'self'" blocks https://formspree.io` },
    ]);
  });

  it("allows a CSP form-action that lists Formspree", () => {
    const dir = build({ "contact/index.html": form(), _headers: "/*\n  Content-Security-Policy: default-src 'self'; form-action 'self' https://formspree.io\n" });
    expect(checkFormspree({ dir, formspreeId: "abc123" })).toEqual([]);
  });

  it("ignores forms that do not post to Formspree", () => {
    const dir = build({ "search/index.html": "<form action=/search method=get><input name=q></form>" });
    expect(formspreeForms(dir)).toEqual([]);
  });
});
```

In `test/workflows.test.js`, inside `describe("site-pr.yml", …)`, insert immediately before `it("requires every live result file in the summary", …)`:

```js
  it("passes the site's own params formspreeId to the offline checks", () => {
    const t = text("site-pr.yml");
    expect(t).toContain(`FORMSPREE_ID=$(hugo config --format json | jq -r '.params.formspreeid // ""')`);
    expect(t).toContain('offline --dir public --host "$HOST" --formspree-id "$FORMSPREE_ID"');
  });
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run test/formspree.test.js test/workflows.test.js`
Expected: `formspree.test.js` fails to import (`checkFormspree` is not exported), and the new workflows test fails on `toContain`.

- [ ] **Step 4: Implement.** In `checks/offline.mjs`, insert this block immediately before `export const OFFLINE_CHECKS = {`:

```js
const FORMSPREE_ACTION = /^https:\/\/formspree\.io\/f\/([A-Za-z0-9]+)$/;

/** Value of attribute `name` in one start tag (quoted or, as Hugo --minify writes them, bare), or null. */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}
const hasFlag = (tag, name) => new RegExp(`\\s${name}(?=[\\s>=/])`, "i").test(tag);

/**
 * Every built <form> whose action points at Formspree: { file, action, id, open, body }.
 * `id` is null when the action is not exactly https://formspree.io/f/<id> (e.g. an empty param).
 */
export function formspreeForms(dir) {
  const forms = [];
  for (const rel of readdirSync(dir, { recursive: true })) {
    const path = String(rel).split("\\").join("/");
    if (!path.endsWith(".html")) continue;
    for (const [, open, body] of (readText(dir, path) ?? "").matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/gi)) {
      const action = attr(open, "action") ?? "";
      if (!/formspree\.io/i.test(action)) continue;
      forms.push({ file: path, action, id: action.match(FORMSPREE_ACTION)?.[1] ?? null, open, body });
    }
  }
  return forms;
}

/** _headers CSP lines whose form-action would block a POST to Formspree. */
function cspBlocksFormspree(dir) {
  const failures = [];
  (readText(dir, "_headers") ?? "").split(/\r?\n/).forEach((line, i) => {
    const csp = line.match(/^\s+Content-Security-Policy:\s*(.+)$/i)?.[1];
    const directive = csp?.split(";").map((d) => d.trim().split(/\s+/)).find(([n]) => n.toLowerCase() === "form-action");
    if (!directive) return; // form-action does not fall back to default-src
    const ok = directive.slice(1).some((s) => ["*", "https:", "formspree.io", "https://formspree.io", "https://formspree.io/"].includes(s.toLowerCase()));
    if (!ok) failures.push(fail("formspree", `_headers:${i + 1}`, `CSP form-action "${directive.slice(1).join(" ")}" blocks https://formspree.io`));
  });
  return failures;
}

/**
 * Formspree forms post to the site's own ID (params formspreeId, passed in by the workflow),
 * by POST, with the fields Formspree needs, and the CSP lets the POST through.
 * minimal: CSP form-action is read from every _headers rule, not matched per path; upgrade path
 * is matching each form's page against the _headers path patterns.
 */
export function checkFormspree({ dir, formspreeId }) {
  const forms = formspreeForms(dir);
  const failures = [];
  if (forms.length === 0) {
    if (formspreeId) failures.push(fail("formspree", "params.formspreeId", `"${formspreeId}" is set but no built page has a Formspree form`));
    return failures;
  }
  for (const { file, action, id, open, body } of forms) {
    if (!id) failures.push(fail("formspree", file, `form action "${action}" is not https://formspree.io/f/<id>`));
    else if (formspreeId !== undefined && id !== formspreeId) {
      failures.push(fail("formspree", file, `form posts to ${id}, but params formspreeId is "${formspreeId}"`));
    }
    if ((attr(open, "method") ?? "get").toLowerCase() !== "post") failures.push(fail("formspree", file, "form method must be post"));
    const fields = [...body.matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)].map(([tag]) => tag);
    const email = fields.find((t) => attr(t, "name") === "email");
    if (!email || (attr(email, "type") ?? "").toLowerCase() !== "email" || !hasFlag(email, "required")) {
      failures.push(fail("formspree", file, 'needs a required <input type="email" name="email">'));
    }
    const message = fields.find((t) => attr(t, "name") === "message");
    if (!message || !hasFlag(message, "required")) failures.push(fail("formspree", file, 'needs a required field named "message"'));
  }
  return [...failures, ...cspBlocksFormspree(dir)];
}
```

Add `  formspree: checkFormspree,` as the last entry of `OFFLINE_CHECKS`.

In `checks/cli.mjs`:
- change the import to `import { OFFLINE_CHECKS, formspreeForms } from "./offline.mjs";`
- add `    "formspree-id": { type: "string" },` directly after `    host: { type: "string" },`
- in `case "offline"`, replace the `for` line with:

```js
    for (const check of Object.values(OFFLINE_CHECKS)) {
      failures.push(...(await check({ dir: opt.dir, host: opt.host, formspreeId: opt["formspree-id"] })));
    }
```

In `.github/workflows/site-pr.yml` (the `Offline checks` step), replace the two `run:` lines with:

```yaml
          mkdir -p results
          # The site's params.toml is the one place its Formspree ID lives (empty when it has no form).
          FORMSPREE_ID=$(hugo config --format json | jq -r '.params.formspreeid // ""')
          node .site-pipeline/checks/cli.mjs offline --dir public --host "$HOST" --formspree-id "$FORMSPREE_ID" --json results/10-offline.json
```
Hugo lowercases param keys in `hugo config` output (`formspreeid`). This was checked on 2026-09-23 across four sites: KingFamily `mgeggkzw`, JillK.ing `xyzggdoa`, BBKing and W3BBK `""`. If `hugo config` fails, the step writes no `10-offline.json`, and `summary --expect` reports it missing, so the gate fails closed.

- [ ] **Step 5: Run to see them pass, then prove the tests bite**

Run: `npx vitest run`. Expected: **`Tests 138 passed (138)`**. That's the 127 baseline, plus 9 new `it` blocks, plus 1 automatic "GOOD fixture passes formspree" case (the `it.each` over `OFFLINE_CHECKS`), plus 1 workflows test. Count rather than trust this: `(Select-String -Path test\formspree.test.js -Pattern '^\s+it\(').Count` → `9`. If the runner reports another total, find out why before going on.

Then break each guard in turn, making one edit at a time and undoing it by hand afterwards:
1. Replace `else if (formspreeId !== undefined && id !== formspreeId)` with `else if (false)`. Expected: "flags a form posting to an ID other than…" fails.
2. Replace the CSP `if (!ok)` with `if (false)`. Expected: "flags a CSP form-action that blocks Formspree…" fails.

After undoing both, `npx vitest run` shows 138 passing again.

- [ ] **Step 6: Run against real builds**

```powershell
Set-Location P:\Family_Websites\KingFamily; hugo --gc --minify --destination $env:TEMP\kf-a --quiet --cleanDestinationDir
Set-Location P:\Family_Websites\BBKing.net; hugo --gc --minify --destination $env:TEMP\bb-a --quiet --cleanDestinationDir
Set-Location P:\Family_Websites\site-pipeline
node checks\cli.mjs offline --dir $env:TEMP\kf-a --host kingfamily.info --formspree-id mgeggkzw; "exit=$LASTEXITCODE"
node checks\cli.mjs offline --dir $env:TEMP\kf-a --host kingfamily.info --formspree-id xyzggdoa; "exit=$LASTEXITCODE"
node checks\cli.mjs offline --dir $env:TEMP\bb-a --host bbking.net --formspree-id ''; "exit=$LASTEXITCODE"
```
Expected: `PASS` / `exit=0`; then `FAIL` with `contact/index.html: form posts to mgeggkzw, but params formspreeId is "xyzggdoa"` / `exit=1`; then `PASS` / `exit=0`. (All three were observed on a scratch copy on 2026-09-23.)

- [ ] **Step 7: Commit**

```powershell
git add -- checks/offline.mjs checks/cli.mjs .github/workflows/site-pr.yml test/formspree.test.js test/workflows.test.js
git commit -m "feat: add Formspree offline check"
```

### Task 2: Formspree weekly canary

**Files:** Modify `checks/live.mjs` (append), `checks/cli.mjs` (new case), `.github/workflows/site-weekly.yml`, `test/formspree.test.js`, `test/workflows.test.js`, `README.md`.

**Interfaces:**
- Consumes: `formspreeForms(dir)` (Task 1).
- Produces: `checkFormspreeCanary(id, host, { fetchImpl, now }) → failures[]`; the CLI command `formspree-canary --dir <public> --host <host>` prints `SKIP …` and exits 0 when the build has no Formspree form.

- [ ] **Step 1: Write the failing tests.** In `test/formspree.test.js`, add `import { checkFormspreeCanary } from "../checks/live.mjs";` after the existing imports, and append:

```js
describe("checkFormspreeCanary", () => {
  const answer = (status, body, seen = []) => async (url, init) => {
    seen.push({ url, init });
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  };

  it("passes when Formspree accepts a JSON submission marked [CI canary]", async () => {
    const seen = [];
    const found = await checkFormspreeCanary("abc123", "kingfamily.info", { fetchImpl: answer(200, '{"next":"/thanks","ok":true}', seen) });
    expect(found).toEqual([]);
    expect(seen[0].url).toBe("https://formspree.io/f/abc123");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.headers.Accept).toBe("application/json");
    expect(JSON.parse(seen[0].init.body)._subject).toBe("[CI canary] kingfamily.info");
  });

  it("fails with the status and Formspree's error when the submission is refused", async () => {
    const found = await checkFormspreeCanary("abc123", "kingfamily.info", { fetchImpl: answer(403, '{"error":"reCAPTCHA failed"}') });
    expect(found).toEqual([
      { check: "formspree-canary", file: "https://formspree.io/f/abc123", message: 'returned 403: {"error":"reCAPTCHA failed"}' },
    ]);
  });

  it("fails on a 200 that is not {ok:true} (an HTML captcha page)", async () => {
    const found = await checkFormspreeCanary("abc123", "kingfamily.info", { fetchImpl: answer(200, "<html>Please verify</html>") });
    expect(found[0].message).toBe("returned 200: <html>Please verify</html>");
  });
});
```

In `test/workflows.test.js`, inside `describe("site-weekly.yml", …)`, insert before `it("fetches security.txt with curl …`:

```js
  it("runs the Formspree canary on the built site and tracks failures in one issue", () => {
    const t = text("site-weekly.yml");
    expect(t).toContain('formspree-canary --dir public --host "$HOST" | tee canary.txt');
    expect(t).toContain("FAILED: ${{ steps.canary.outcome == 'failure' }}");
    expect(t).toContain('issue --title "site-pipeline: weekly Formspree canary failing" --file canary.txt');
  });
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run test/formspree.test.js test/workflows.test.js`. Expected: import error for `checkFormspreeCanary`, and the new workflows test fails.

- [ ] **Step 3: Implement.** Append to `checks/live.mjs`:

```js

/**
 * Weekly Formspree canary: one real JSON submission, marked [CI canary] in its subject, must be
 * accepted with {"ok":true}. formspree.io is not a family zone, so Node's fetch is not challenged.
 */
export async function checkFormspreeCanary(id, host, { fetchImpl = fetch, now = new Date() } = {}) {
  const url = `https://formspree.io/f/${id}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `canary@${host}`,
      _subject: `[CI canary] ${host}`,
      message: `site-pipeline weekly canary for ${host} at ${now.toISOString()}. No reply needed.`,
    }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: a captcha or error page; reported below
  }
  if (res.status !== 200 || body?.ok !== true) {
    return [fail("formspree-canary", url, `returned ${res.status}: ${text.slice(0, 200).replace(/\s+/g, " ")}`)];
  }
  return [];
}
```

In `checks/cli.mjs`: add `checkFormspreeCanary` to the `./live.mjs` import (alphabetical: first in the list), and insert this case immediately before `  case "visual": {`:

```js
  case "formspree-canary": {
    // The ID comes from the built form, so the canary exercises exactly what is deployed.
    need("host");
    const ids = [...new Set(formspreeForms(opt.dir).map((f) => f.id).filter(Boolean))];
    if (ids.length === 0) report("formspree canary (no Formspree form in the build)", [], "skip");
    const failures = [];
    for (const id of ids) failures.push(...(await checkFormspreeCanary(id, opt.host)));
    report(`formspree canary (${ids.join(", ")})`, failures);
    break;
  }
```
(`report` calls `process.exit`, so the `skip` line ends the command.)

In `.github/workflows/site-weekly.yml`, insert before `      - name: Build lychee exclude args`:

```yaml
      - name: Formspree canary
        id: canary
        continue-on-error: true
        # The ID comes from the built form; a site with no Formspree form reports SKIP and passes.
        run: node .site-pipeline/checks/cli.mjs formspree-canary --dir public --host "$HOST" | tee canary.txt

      - name: Formspree canary issue
        if: always()
        env:
          FAILED: ${{ steps.canary.outcome == 'failure' }}
        run: |
          extra=()
          if [ "$FAILED" = true ]; then extra+=(--failing); fi
          node .site-pipeline/checks/cli.mjs issue --title "site-pipeline: weekly Formspree canary failing" --file canary.txt "${extra[@]}"

```

In `README.md`, add this after the `Secrets (repo **and** Dependabot)` line:

```markdown

**Formspree.** A site's form ID lives only in its own `config/_default/params.toml` (`formspreeId`).
`site-pr.yml` reads it with `hugo config` and fails the PR if a built form posts anywhere else, the
action is malformed, `email`/`message` are not required, or a CSP `form-action` blocks Formspree.
`site-weekly.yml` sends one real submission (subject `[CI canary] <host>`) to each ID found in the
built forms. Sites without a form skip both.
```

- [ ] **Step 4: Run to see them pass, and break-test.** Run `npx vitest run`. Expected: **142 passed** (138 + 3 canary + 1 workflows; recount the `it(` lines rather than trusting this). Then replace `if (res.status !== 200 || body?.ok !== true)` with `if (res.status !== 200)`. Only "fails on a 200 that is not {ok:true}" should fail. Revert.

- [ ] **Step 5: Run the skip path for real** (BBKing, no form; no network call is made):

`node checks\cli.mjs formspree-canary --dir $env:TEMP\bb-a --host bbking.net; "exit=$LASTEXITCODE"` → `SKIP     formspree canary (no Formspree form in the build)`, `exit=0`.
Don't run it against KingFamily's build here: that sends a real email. It happens in Task 3 Step 1, and only after Brian's go.

- [ ] **Step 6: Record the design in the spec.** Append one row to the **Revisions** table of `.agents/specs/2026-09-23-workers-ci-pipeline-design.md`:

```markdown
| Formspree | No `Formspree IDs` workflow input. The PR check reads the site's `params.toml` `formspreeId` via `hugo config`; the weekly canary takes the ID from the built form. BrianBK.ing and KingFamily sharing `mgeggkzw` is intentional (same destination); they can diverge by editing one site's `params.toml`. | One source of truth per site (Brian, wave 3 planning). |
```
In the **Open items** list, delete the line `- Is the shared Formspree ID \`mgeggkzw\` (BrianBK.ing + KingFamily) intentional?`, since the row above answers it.

- [ ] **Step 7: Commit** (the README and spec changes go in the same commit):

```powershell
git add -- checks/live.mjs checks/cli.mjs .github/workflows/site-weekly.yml test/formspree.test.js test/workflows.test.js README.md .agents/specs/2026-09-23-workers-ci-pipeline-design.md
git commit -m "feat: add weekly Formspree canary"
```

### Task 3: Verify Formspree, then release v1.1.0 — ask Brian first

- [ ] **Step 1: One real canary** (go-ahead first; it sends one email to the `mgeggkzw` inbox and uses one of the form's monthly submissions):

`node checks\cli.mjs formspree-canary --dir $env:TEMP\kf-a --host kingfamily.info; "exit=$LASTEXITCODE"`
Expected: `PASS     formspree canary (mgeggkzw)` and an email with subject `[CI canary] kingfamily.info` in Brian's inbox. Brian confirms which folder it lands in.
**If it fails** with a reCAPTCHA error, Brian decides between turning off reCAPTCHA for the form in Formspree's dashboard (the site renders no reCAPTCHA widget, and its CSP blocks `google.com/recaptcha`) and dropping the canary for this form. Don't tag until one of those is settled.

- [ ] **Step 2: Bump the version.** In `package.json`, set `"version": "1.1.0"`. Run `npx vitest run` → all pass. Then commit: `git add -- package.json; git commit -m "chore: release v1.1.0"`.

- [ ] **Step 3: Merge and tag** (go-ahead first):

```powershell
git switch main
git merge --ff-only feature/formspree-checks
git tag -a v1.1.0 -m "v1.1.0: Formspree offline check and weekly canary"
```
*Brian runs* `git -C P:\Family_Websites\site-pipeline push origin main v1.1.0`. Claude then runs `gh run watch --repo brianbking/site-pipeline --exit-status`. Expected: `ci` green (vitest + actionlint). Then `git branch -d feature/formspree-checks`.

- [ ] **Step 4: Let Dependabot move W3BBK and BBKing.** Their pending `v1.0.0` PRs should be superseded by a `v1.1.0` PR, which auto-merges into `staging` on a green `site-gate`. That supersede behaviour is expected but hasn't been confirmed. Promote `staging` → `main` for each site by hand. This doesn't block Part B.

---

## Part B — KingFamily (kingfamily.info)

### Task 4: Precondition and accessibility to ≥ 95

**Files** (in `P:\Family_Websites\KingFamily`): `layouts/partials/home/header.html`, `layouts/partials/home/members.html`, `layouts/contact/single.html`, `layouts/referrals/single.html`, `layouts/partials/contact-form.html`, `assets/sass/styles.scss`, `assets/sass/dark/styles.scss`.

- [ ] **Step 1: Precondition.** On 2026-09-23 the repo was on `fix/wrangler-advisories` (at `main`'s commit `1c2112b`), with `package.json` / `package-lock.json` staged (wrangler `^4.95.0` → `^4.136.3`), and `origin/development` existed. **Stop and ask Brian** what to do with that branch and what to do with `development`. Task 5 replaces `package.json` wholesale anyway (`wrangler ^4.137.0` as a dev dependency). Proceed once `git status --short --branch` shows `## main...origin/main` and nothing else. Then:

```powershell
git switch -c feature/workers-ci
```

- [ ] **Step 2: Baseline.** Build, serve and run Lighthouse exactly as in wave 2 Task 1 Steps 2–3 (port 8799, `$env:TEMP\kf-lh`), for each of `/`, `/contact/` and `/referrals/`, with `--only-categories=accessibility`. Expected: `a11y` = 93 / 85 / 92. The failing audits are `landmark-one-main` and `link-name` (home); `link-name`, `color-contrast`, `tabindex` and `target-size` (contact); and `link-name` and `target-size` (referrals).

- [ ] **Step 3: Fix.** Each edit is an exact replacement.

`layouts/partials/home/header.html`: the home brand is an empty, unfocusable link (`link-name`). Replace

```html
        <span><a href="/" class="navbar-brand mb-0 fs-1 text-shadow fst-italic" tabindex="-1">&nbsp;</a></span>
```
with
```html
        <span class="navbar-brand mb-0 fs-1 text-shadow fst-italic" aria-hidden="true">&nbsp;</span>
```

`layouts/partials/home/members.html` line 1: the home page has no main landmark. Replace `<div class="mt-3 mt-md-5">` with `<div class="mt-3 mt-md-5" role="main">`. This is a role, not a `<main>` wrapper, so the flex layout is untouched.

`layouts/contact/single.html` **and** `layouts/referrals/single.html`: the breadcrumb's Home text is hidden on mobile (`link-name`). Replace

```html
<li class="breadcrumb-item"><a href="/"><span class="d-inline d-md-none"><i class="fa-solid fa-house"></i></span>
```
with
```html
<li class="breadcrumb-item"><a href="/" aria-label="Home"><span class="d-inline d-md-none"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
```

`layouts/partials/contact-form.html`: delete every ` tabindex="1"` … ` tabindex="10"` attribute, 10 in all. DOM order already equals the old tab order. Check: `(Select-String -Path layouts\partials\contact-form.html -Pattern 'tabindex').Count` → `0`.

`assets/sass/styles.scss`: append

```scss

.navbar .nav-link {
	min-width: 24px; // icon-only links on mobile were 18px wide (Lighthouse target-size)
	text-align: center;
	position: relative; // above the oversized brand link, which overlapped the targets
	z-index: 1;
}
```

`assets/sass/dark/styles.scss`: insert immediately before the tab-indented `	/* reset */` line:

```scss
	// body opacity 0.87 blends over a white canvas and lifted the default button colours under 4.5:1
	#fs-frm .btn-success { --bs-btn-bg: #146c43; --bs-btn-border-color: #146c43; }
	#fs-frm .btn-secondary { --bs-btn-bg: #565e64; --bs-btn-border-color: #565e64; }

```
The contrast failure appears only in dark mode, which the local Lighthouse used because it follows the OS theme. CI's Lighthouse probably runs light, so the gate may never see it; it's still a real defect.

- [ ] **Step 4: Re-run and see it pass.** Rebuild and re-run Step 2 for all three pages. Expected: `a11y=100` on all three (measured on a scratch copy on 2026-09-23). If any page is below 95, stop and report the failing audit's `details.items[].node.explanation`; don't guess new values. Stop the server and confirm nothing is listening on 8799.

- [ ] **Step 5: Commit**

```powershell
git add -- layouts/partials/home/header.html layouts/partials/home/members.html layouts/contact/single.html layouts/referrals/single.html layouts/partials/contact-form.html assets/sass/styles.scss assets/sass/dark/styles.scss
git commit -m "fix: bring KingFamily pages to WCAG AA"
```
`contact-form.html` is the shared partial that BrianBK.ing and JillK.ing also carry. Wave 4 needs the same `tabindex` removal there; note it in the findings (Task 8).

### Task 5: Convert the repo to site-pipeline

Follow **wave 2 Task 2** (Steps 1–9) with these substitutions and differences. Everything not listed here is identical.

| Wave 2 | Wave 3 |
|---|---|
| `bbking` / `bbking-staging` | `kingfamily` / `kingfamily-staging` |
| `bbking.net` / `staging.bbking.net` | `kingfamily.info` / `staging.kingfamily.info` |
| `v0.1.7` (every pin, `package.json`) | `v1.1.0` |
| `"name": "bbking"` in `package.json` | `"name": "kingfamily"` |
| Step 2 `git rm --cached .hugo_build.lock` | **skip**: KingFamily doesn't track it (checked) |

- **`src/worker.js` is replaced, not created.** The old file served markdown to any `Accept` containing `text/markdown`, and never ran for HTML routes. The shared Worker needs markdown q > HTML q, and adds `Link` and `Vary` (spec: Worker behaviour).
- **`pr.yml`** adds page lists after `worker: kingfamily`:
  ```yaml
      visual-pages: '["/", "/contact/", "/referrals/"]'
      lighthouse-pages: '["/", "/contact/", "/referrals/"]'
  ```
- **`deploy.yml`** `smoke-pages: '["/", "/contact/", "/referrals/", "/llms.txt", "/.well-known/agent-card.json"]'`.
- **`.gitignore`** has no `*.url` line. Append `.wrangler/`, `.site-pipeline/` and `gate-out/` as in wave 2.
- **Step 6 deletes:** `git rm -r -- functions static/_routes.json build.sh`.
- **Docs (Step 7).** In `CLAUDE.md`:
  - line 7: replace "hosted on Cloudflare Pages, with a Pages Functions middleware layer." with "served by the Cloudflare Worker `kingfamily`, using the shared `site-pipeline` Worker."
  - line 16: replace "Cloudflare Pages builds from source on every push to `main`." with "GitHub Actions builds from source."
  - `## Deployment` body → "PR into `staging` → preview URL and checks (`site-gate`) → merge → staging.kingfamily.info (Access login) → PR `staging` → `main` → production. GitHub Actions deploys via `brianbking/site-pipeline`; see its README. Hugo's version is pinned in site-pipeline's `toolchain.json`. The Formspree form ID is `formspreeId` in `config/_default/params.toml`, the only place it lives; the PR checks and weekly canary read it from there."
  - `## Cloudflare Pages` → `## Cloudflare`, with the `functions/_middleware.js` bullet → "`src/worker.js` — re-exports the shared Worker (markdown negotiation, `Link` alternate, staging `noindex`) from `@kingfamily/site-worker`".

  In `README.md`:
  - line 3: "Built with Hugo and served by a Cloudflare Worker."
  - `Hosting` row → `[Cloudflare Workers](https://developers.cloudflare.com/workers/) static assets`; `Middleware` row → `Shared Worker from brianbking/site-pipeline`.
  - line 30: "GitHub Actions builds from source on deploy".
  - `## Deployment` body → "GitHub Actions builds and deploys through [site-pipeline](https://github.com/brianbking/site-pipeline): PRs into `staging` get a preview URL and checks, `staging` deploys to staging.kingfamily.info, and `main` deploys to production. Hugo's version is pinned in site-pipeline's `toolchain.json`."
  - tree: `├── functions/ …` → `├── src/worker.js       # Re-exports the shared site Worker`, placed below `content/`.
  - `## Content Negotiation`: replace "the middleware serves the corresponding markdown file (index.md, referrals.md, contact.md)" with "the shared Worker serves the page's `index.md` when the request prefers markdown over HTML".

  Leftover check, which must cover `static/` and `layouts/` (wave 2 finding):
  `Select-String -Path CLAUDE.md,README.md,static\*.*,static\.well-known\*.json -Pattern 'Cloudflare Pages|Pages Functions|functions/|build\.sh|wrangler\.toml'` returns nothing. The `## Pages` headings in `layouts/index.md`, `index.llmstxt` and `contact/single.md` are page lists, not hosting; leave them.
- **Step 8 offline run** passes the ID: `node ..\site-pipeline\checks\cli.mjs offline --dir public --host kingfamily.info --formspree-id mgeggkzw`. Smoke pages: as in `deploy.yml`.
- **Step 9 commit** also stages the replaced `src/worker.js`. Message: `feat: deploy via site-pipeline on Workers`.

### Task 6: Accounts and dashboard — Brian, with Claude guiding

Follow **wave 2 Task 3** with the repo `brianbking/KingFamily` and these differences:

- [ ] **Step 1: Branches.** *Brian runs* `git -C P:\Family_Websites\KingFamily push origin main:staging`. `development` was decided in Task 4 Step 1.
- [ ] **Step 2: Label and Actions permissions:** as in wave 2, with `--repo brianbking/KingFamily`.
- [ ] **Step 3: Secrets.** Claude writes `$env:TEMP\Set-KingFamilySecrets.ps1`, and *Brian runs* it with `powershell -NoProfile -File`:

```powershell
#Requires -Version 5.1
# One-off: copy the King Family Cloudflare token + account ID into KingFamily's Actions and Dependabot secrets.
# --body, never a pipe: piping under PS 5.1 stores a trailing CRLF (wave 2).
param(
    [string]$Repo  = 'brianbking/KingFamily',
    [string]$Vault = 'King Family - Brian',
    [string]$Item  = 'site-pipeline-king-family'
)
$ErrorActionPreference = 'Stop'
foreach ($app in 'actions', 'dependabot') {
    gh secret set CLOUDFLARE_API_TOKEN --app $app --repo $Repo --body (op read "op://$Vault/$Item/credential").Trim()
    if ($LASTEXITCODE -ne 0) { throw "CLOUDFLARE_API_TOKEN ($app) failed" }
    gh secret set CLOUDFLARE_ACCOUNT_ID --app $app --repo $Repo --body (op read "op://$Vault/$Item/account_id").Trim()
    if ($LASTEXITCODE -ne 0) { throw "CLOUDFLARE_ACCOUNT_ID ($app) failed" }
}
'Set 2 secrets x 2 apps on ' + $Repo
```
Verify: `gh secret list --app actions --repo brianbking/KingFamily` and `--app dependabot` each list both names.

- [ ] **Step 4: Bootstrap the staging Worker** (Brian's terminal): `npm run build`, then `npx wrangler deploy --env staging`. Expected: `kingfamily-staging (custom domain) staging.kingfamily.info`. **If wrangler reports an existing DNS record for the hostname,** stop (Review Focus 5). Brian inspects the zone's DNS; Claude doesn't propose deleting records. The zone's wildcard record predates this plan.
- [ ] **Step 5: Preview URLs toggle** on `kingfamily` (dashboard → Settings → Domains & Routes → Preview URLs → Enable). Verify in Brian's terminal: `npx wrangler versions upload --env=""` prints a `Version Preview URL:` line.
- [ ] **Step 6: Access already exists.** `staging.kingfamily.info` already redirected to `catastrophic.cloudflareaccess.com` on 2026-09-23. Brian opens the Access application in the dashboard and confirms its policy is *Allow* and includes only his email. Nothing gets created.
- [ ] **Step 7: Verify the redirect by hand:** wave 2's curl with `https://staging.kingfamily.info/`. Expected: `302 https://catastrophic.cloudflareaccess.com/...`. A `200` means staging is public; stop.
- [ ] **Step 8:** Leave the Workers Builds Git connection ON until Task 8.

### Task 7: First PR through the pipeline

Follow **wave 2 Task 4**, using `--repo brianbking/KingFamily` and the title `feat: deploy via site-pipeline on Workers`, with body `Wave 3 of site-pipeline (v1.1.0).`. Beyond wave 2's checks, confirm:
- The `site-gate` offline row passes, which proves `hugo config` + `jq` resolved `mgeggkzw` on the runner. If it fails naming `params formspreeId is ""`, the runner's `hugo config` output differs from local 0.166. Investigate with `/systematic-debugging`.
- Lighthouse A11y ≥ 95 on all three pages (Task 4).
- Visual: Task 4 changes the mobile navbar (link width) and home header markup. Expect a small header diff on the mobile viewport. Label `approved-visual-change` only after Brian looks at the `visual-diffs` artifact. Any change outside the navbar is a regression.

### Task 8: Cutover and exit criteria — ask Brian before each merge

Follow **wave 2 Task 5** with `kingfamily` / `kingfamily.info`. Production was **not** stale: on 2026-09-23 the live `/`, `/contact/` and `/referrals/` differed from a local build of `main` only by Cloudflare's injected challenge script, so no surprise content ships at cutover. Additions:

- [ ] Step 4's live checks run against `https://kingfamily.info/`.
- [ ] Step 5 adds the canary: `gh workflow run weekly.yml --repo brianbking/KingFamily`, then `gh run watch --exit-status`. Expected: the `Formspree canary` step prints `PASS     formspree canary (mgeggkzw)`, no issue opens, and Brian receives the `[CI canary] kingfamily.info` email.
- [ ] Step 6 exit criteria are wave 2's plus one green weekly canary. Then append `## Wave 3 — KingFamily (YYYY-MM-DD)` to `.agents/findings/2026-09-23-w3bbk-pilot.md`. Record anything that differed from wave 2, whether the custom domain coexisted with the wildcard DNS record, the canary's inbox folder, the shared `contact-form.html` `tabindex` fix that wave 4 inherits, and Actions minutes. Commit in site-pipeline with `docs: record wave 3 findings`.

### Task 9: Close out

- [ ] In `.agents/tasks/backlog.md`: move Wave 3 to **Completed** (`_Completed: YYYY-MM-DD_`, plan and findings links); add the `v1.1.0` release. Commit: `docs: mark wave 3 and v1.1.0 done`.

---

## Open decisions (Brian; none blocks Part A)

- **`fix/wrangler-advisories` and `origin/development`** in KingFamily: merge, park or delete (Task 4 Step 1).
- **The contact form's dead client code.** `contact-form.js` calls `getElementById('myForm')` (the form's id is `fs-frm`), so every Submit click throws a TypeError before the native submit goes ahead. The reCAPTCHA script is CSP-blocked and has no widget. Both are out of scope here and go to the backlog; Task 3 Step 1's result decides whether reCAPTCHA is dead or needs wiring up.
- **A stale `kingfamily-preview` Worker** may exist from the removed `env.preview` (`d06e4aa`). Check with `npx wrangler deployments list --name kingfamily-preview` in Brian's terminal. Delete it only with Brian's confirmation.
- **Canary volume once wave 4 lands:** BrianBK.ing shares `mgeggkzw`, so two canaries a week reach the same inbox. That's about 9 of Formspree's monthly submission allowance, assuming the free tier's 50.
