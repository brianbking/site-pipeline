# site-pipeline Wave 4 — BrianBK.ing + JillK.ing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release site-pipeline `v1.2.0`, which adds private paths, a PDF build step and a PDF link check. Then move brianbk.ing and jillk.ing from Workers Builds to GitHub Actions → Workers on `v1.2.0`, with PR previews, `staging.<host>`, markdown negotiation and the résumé PDF built in CI. The `/resume/` section must never be public on any preview URL.

**Architecture:** On both sites, `/resume/` (including its PDF) sits behind a zone Cloudflare Access app in production. That app does not cover `*.workers.dev`, and the pipeline tests on `workers.dev` preview URLs, so without a fix every PR preview and every uploaded version would serve the résumé publicly. We tried putting Access on the preview URLs themselves, with a service token for CI. After 3 runs the token was still refused, and the approach also risked the token reaching third-party hosts (findings, Wave 4 planning). So the shared Worker gets an opt-in `PRIVATE_PATHS` variable instead: on a `*.workers.dev` host it answers 404 for those paths. A live check proves the 404 on every PR preview and on every deploy's version preview before promotion. The PDF is built by an optional site script, `build:pdf`, which runs after Hugo in the PR and deploy builds. A new offline check, `pdf-links`, fails the build when a linked PDF is missing, so the step fails closed without needing a workflow input. Part B ports the wave 2/3 configuration to both sites, plus a11y fixes measured at 100 on scratch copies.

**Tech Stack:** Node 24, Vitest 5, GitHub Actions; Hugo extended 0.162.0 in CI (0.166.0 locally); Wrangler 4.137+; Lighthouse 13 (local baseline); Puppeteer + `@sparticuz/chromium` (site-owned PDF script).

**Spec:** `.agents/specs/2026-09-23-workers-ci-pipeline-design.md`. Its **Revisions** table binds where it disagrees with the text above it. Findings: `.agents/findings/2026-09-23-w3bbk-pilot.md`, including its Wave 2, Wave 3 and Wave 4 planning sections. Templates: wave 2 plan Tasks 2–5 (`.agents/plans/2026-09-23-site-pipeline-wave2-bbking.md`) and wave 3 plan Tasks 5–8.

## Global Constraints

- New release **`v1.2.0`** (minor). Every addition is opt-in: `PRIVATE_PATHS` unset, `private-pages` defaulting to `[]`, and no `build:pdf` script together leave W3BBK, BBKing and KingFamily behaving exactly as they do today. `pdf-links` passes on all three builds (checked 2026-09-25). BrianBK.ing and JillK.ing pin `v1.2.0` in all three workflow files **and** `package.json`.
- `package.json` dependency form is `git+https://github.com/brianbking/site-pipeline.git#v1.2.0`. `npm install` rewrites it to `github:`; re-edit it and check with `Select-String`.
- Private path on both sites: **`/resume`**. It goes in `vars.PRIVATE_PATHS` **and** `env.staging.vars.PRIVATE_PATHS`, because wrangler `vars` are not inherited by environments.
- Production wrangler commands pass `--env=""` (`--env=` in YAML).
- Secrets: `gh secret set NAME --body (op read …).Trim()`, **never** piped. Vault `King Family - Brian`, item `site-pipeline-king-family`, fields `credential` / `account_id`.
- **Claude never runs `git push`** (hard-denied). Every push step is *Brian runs*. PR merges, dashboard changes, tags, branch deletes, Pages project deletion and any real Formspree submission happen only after Brian says go for that step.
- `wrangler` commands that need `CLOUDFLARE_API_TOKEN` run in Brian's own terminal.
- Commits: Conventional Commits, summary ≤ 50 characters (measure with `'<summary>'.Length`), no `Co-Authored-By` trailer, stage by explicit path, never `git add -A`.
- Windows host: PowerShell tool unless a step says Bash.

## Review Focus

1. **PDF generation on the GitHub runner is untested.** `@sparticuz/chromium` couldn't be run on Linux here: WSL had no DNS, and Docker wasn't running. The old `build.sh` swallowed failures (`|| echo "WARNING: PDF generation failed — skipping."`), so nobody knows whether Workers Builds ever produced the PDF. The first PR's `build` job is the proof. If it fails, the report is BLOCKED plus `/systematic-debugging`. **Never** make `build:pdf` non-fatal. The `pdf-links` break test in Task 3 proves the gate would catch a missing PDF.
2. **`PRIVATE_PATHS` missing from `env.staging`.** The staging deploy smokes the staging *version preview*, which is a `workers.dev` URL. Without the variable, that preview serves the résumé. The deploy smoke's private-page check catches this (Task 2, "is part of the deploy smoke"), and both of Task 7's Step 8 dry runs must list `PRIVATE_PATHS`.
3. **Spellings of `/resume` that slip past the guard:** case, percent-encoding, a doubled slash, dot segments, an undecodable path, and a trailing-dot hostname. Each spelling is a Task 1 `it.each` row. They were checked against the exact guard text on 2026-09-25 (18 of 18).
4. **JillK.ing's weekly canary may email Jill for real.** The canary posts to `xyzggdoa`. If that form has no reCAPTCHA, Formspree accepts the post and forwards a `[CI canary] jillk.ing` email every Monday. Task 9 Step 3 sends one canary, with Brian's go-ahead, before the cutover makes it weekly.
5. **A template that links a PDF the script doesn't write turns the gate red,** by design. `feature/resume-v3` in BrianBK.ing links `resume/v3/<basename>.pdf`, which `generate-resume-pdf.js` never writes. That breaks the first PR that carries it (Task 5 decides where that branch goes). Pinned by the Task 3 test "flags a same-site PDF link with no file in the build".

---

## File Structure

`P:\Family_Websites\site-pipeline\` on branch `feature/private-paths-pdf`:

| File | Change | Responsibility |
|---|---|---|
| `worker/index.js` | Modify | `privatePrefixes()`, `isPrivateRequest()`, 404 ahead of everything in `handle()` |
| `checks/live.mjs` | Modify | `checkPrivate()`; `checkSmoke({ privatePages })` |
| `checks/offline.mjs` | Modify | `checkPdfLinks()`, registered as `pdf-links` |
| `checks/cli.mjs` | Modify | `private` command; `--private-pages` for `smoke` |
| `.github/workflows/site-pr.yml` | Modify | `private-pages` input, Private paths step, `25-private` expected; `build:pdf` |
| `.github/workflows/site-deploy.yml` | Modify | `private-pages` input into smoke; `build:pdf` |
| `test/worker.test.js`, `test/live.test.js`, `test/offline.test.js`, `test/workflows.test.js` | Modify | tests below |
| `README.md`, `package.json`, spec, findings | Modify | docs; `version` 1.2.0 |

Per site, on branch `feature/workers-ci`: the wave 2 file set, plus the Task 6 fix files and `package.json` scripts/dependencies for the PDF.

---

## Part A — site-pipeline v1.2.0

### Task 1: Worker private paths

**Files:** Modify `worker/index.js` (insert after `STAGING_ROBOTS`; guard at the top of `handle()`), `test/worker.test.js` (append).

**Interfaces:**
- Produces: the Worker reads `env.PRIVATE_PATHS` (a JSON array, or a comma-separated string when set in the dashboard). On a hostname ending `.workers.dev`, a request whose decoded, lowercased, slash-collapsed path equals a prefix or sits under one gets `404`, `text/plain`, `Cache-Control: no-store`, body `Not found\n` (none for HEAD). Other hostnames are unaffected.

- [ ] **Step 1: Branch**

```powershell
Set-Location P:\Family_Websites\site-pipeline
git status --short --branch   # expect: ## main...origin/main, nothing else
git switch -c feature/private-paths-pdf
npx vitest run                # baseline: Tests 146 passed (146)
```

- [ ] **Step 2: Write the failing tests.** Append to `test/worker.test.js`:

```js
describe("private paths", () => {
  const PREVIEW = "https://pr-7-brianbking.acct.workers.dev";
  const FILES = {
    ...SITE,
    "/resume/index.html": { body: "<!doctype html><title>CV</title>", type: "text/html; charset=utf-8" },
    "/resume/index.md": { body: "# CV\n", type: "text/markdown; charset=utf-8" },
    "/resume/cv.pdf": { body: "%PDF-1.7", type: "application/pdf" },
    "/resumes/index.html": { body: HTML, type: "text/html; charset=utf-8" },
  };
  const at = (url, { method = "GET", accept = BROWSER, env = { PRIVATE_PATHS: ["/resume"] } } = {}) =>
    worker.fetch(new Request(url, { method, headers: { Accept: accept } }), { ASSETS: makeAssets(FILES), ...env });

  it.each(["/resume/", "/resume", "/resume/cv.pdf", "/RESUME/", "/%72esume/", "//resume/", "/x/../resume/"])(
    "hides %s on a preview URL",
    async (path) => {
      const res = await at(PREVIEW + path);
      expect(res.status).toBe(404);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Link")).toBeNull();
      expect(await res.text()).toBe("Not found\n");
    },
  );

  it("hides the markdown sibling too", async () => {
    expect((await at(`${PREVIEW}/resume/`, { accept: "text/markdown" })).status).toBe(404);
  });

  it("answers HEAD without a body", async () => {
    const res = await at(`${PREVIEW}/resume/`, { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
  });

  it("hides them on a trailing-dot preview hostname", async () => {
    expect((await at("https://pr-7-brianbking.acct.workers.dev./resume/")).status).toBe(404);
  });

  it("serves them on the real hostname, where the zone's Access app gates them", async () => {
    expect((await at("https://brianbk.ing/resume/")).status).toBe(200);
  });

  it("still serves other pages on the preview, including a prefix look-alike", async () => {
    expect((await at(`${PREVIEW}/`)).status).toBe(200);
    expect((await at(`${PREVIEW}/resumes/`)).status).toBe(200);
  });

  it("accepts a comma-separated string (a dashboard-set variable)", async () => {
    expect((await at(`${PREVIEW}/resume/`, { env: { PRIVATE_PATHS: "/private, /resume" } })).status).toBe(404);
  });

  it("serves everything when PRIVATE_PATHS is unset (W3BBK, BBKing, KingFamily)", async () => {
    expect((await at(`${PREVIEW}/resume/`, { env: {} })).status).toBe(200);
  });
});
```

- [ ] **Step 3: Run to see them fail.** `npx vitest run test/worker.test.js`. Expected: 11 new tests fail with `expected 200 to be 404`: the 7 "hides … on a preview URL" rows, "hides the markdown sibling", "answers HEAD", the trailing-dot test and the comma-separated test. The other 3 (real hostname, other pages, unset) pass already.

- [ ] **Step 4: Implement.** In `worker/index.js`, insert after the `const STAGING_ROBOTS = …;` line:

```js

/** PRIVATE_PATHS (array, or comma-separated string) -> lowercased prefixes without a trailing slash. */
function privatePrefixes(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return list
    .map((p) => String(p).trim().toLowerCase())
    .filter(Boolean)
    .map((p) => (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, ""));
}

/**
 * True when this request must not be served: its path is under a PRIVATE_PATHS prefix and it
 * arrived on a workers.dev host (a version or PR preview URL), which the zone's Access app
 * does not cover. The real hostnames stay behind Access, so they are served as usual.
 */
function isPrivateRequest(url, env) {
  const prefixes = privatePrefixes(env.PRIVATE_PATHS);
  if (prefixes.length === 0) return false;
  if (!url.hostname.replace(/\.$/, "").endsWith(".workers.dev")) return false;
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return true; // undecodable path: refuse rather than guess what the assets layer would serve
  }
  path = path.toLowerCase().replace(/\/{2,}/g, "/");
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}
```

In `handle()`, insert directly after `const mdUrl = mdUrlFor(request.url);`:

```js

  // Before negotiation, so neither the page nor its markdown sibling leaks on a preview URL.
  if (isPrivateRequest(new URL(request.url), env)) {
    return new Response(method === "HEAD" ? null : "Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
```

Also add a line `// (d) PRIVATE_PATHS: 404 on workers.dev preview URLs (the zone's Access app gates the real host).` after the `(c)` line of the header comment.

- [ ] **Step 5: Run to see them pass, then prove the tests bite.** `npx vitest run`. Expected: **`Tests 160 passed (160)`**: the 146 baseline, plus 7 `it.each` rows, plus 7 `it` blocks. Count the blocks rather than trusting that figure: `(Select-String -Path test\worker.test.js -Pattern '^\s+it(\.each)?\(').Count` goes from 15 to 23. Then break the guard one edit at a time, undoing each by hand:
1. Delete the `if (!url.hostname…endsWith(".workers.dev")) return false;` line. Expected: "serves them on the real hostname…" fails.
2. Remove `.toLowerCase()` from the `path = path.toLowerCase()…` line. Expected: only the `/RESUME/` row fails.
3. Replace `.replace(/\.$/, "")` with nothing. Expected: only the trailing-dot test fails.

After undoing all three, `npx vitest run` shows 160 passing again.

- [ ] **Step 6: Commit**

```powershell
git add -- worker/index.js test/worker.test.js
git commit -m "feat: hide private paths on preview URLs"
```

### Task 2: Private-path live check

**Files:** Modify `checks/live.mjs`, `checks/cli.mjs`, `.github/workflows/site-pr.yml`, `.github/workflows/site-deploy.yml`, `test/live.test.js`, `test/workflows.test.js`.

**Interfaces:**
- Consumes: the Task 1 Worker behaviour.
- Produces: `checkPrivate(base, { pages, fetchImpl, headers }) → failures[]` (check name `private`); `checkSmoke(base, { …, privatePages = [] })`; the CLI `private --base <url> --pages <json> [--json]` and `smoke … --private-pages <json>`; the workflow input `private-pages` (JSON array string, default `"[]"`) on `site-pr.yml` and `site-deploy.yml`; the result file `results/25-private.json`.

- [ ] **Step 1: Write the failing tests.** In `test/live.test.js`, add `checkPrivate` to the `../checks/live.mjs` import (alphabetical: after `checkNegotiationLive`), add `"/private/index.html": ["<!doctype html>", "text/html; charset=utf-8"],` as the last entry of `FILES`, and insert before `describe("security.txt", …)`:

```js
describe("checkPrivate", () => {
  const PREVIEW = "https://pr-7-site.acct.workers.dev";

  it("passes when every private page is 404 on the preview", async () => {
    const fetchImpl = deployed({ PRIVATE_PATHS: ["/private"] });
    expect(await checkPrivate(PREVIEW, { pages: ["/private/", "/private/cv.pdf"], fetchImpl })).toEqual([]);
  });

  it("fails a private page the preview serves (PRIVATE_PATHS missing, e.g. from env.staging)", async () => {
    expect(await checkPrivate(PREVIEW, { pages: ["/private/"], fetchImpl: deployed() })).toEqual([
      { check: "private", file: `${PREVIEW}/private/`, message: "returned 200; a private path must be 404 on a preview URL" },
    ]);
  });

  it("is part of the deploy smoke", async () => {
    const found = await checkSmoke(PREVIEW, { privatePages: ["/private/"], fetchImpl: deployed() });
    expect(found.map((f) => f.message)).toEqual(["returned 200; a private path must be 404 on a preview URL"]);
  });
});
```

In `test/workflows.test.js`, change the existing expectation `"--expect 10-offline,20-negotiate,30-visual,40-lighthouse"` to `"--expect 10-offline,20-negotiate,25-private,30-visual,40-lighthouse"`. Inside `describe("site-pr.yml", …)`, add after that test:

```js
  it("checks the site's private paths are 404 on the preview", () => {
    expect(text("site-pr.yml")).toContain('private --base "$CANDIDATE" --pages "$PRIVATE_PAGES" --json results/25-private.json');
  });
```

Inside `describe("site-deploy.yml", …)`, add:

```js
  it("smoke-checks private paths on the version preview before promotion", () => {
    expect(text("site-deploy.yml")).toContain('--pages "$SMOKE_PAGES" --private-pages "$PRIVATE_PAGES"');
  });
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run test/live.test.js test/workflows.test.js`. Expected: `checkPrivate is not a function` for the first two, the smoke test returns `[]`, and the three workflow expectations fail on `toContain`.

- [ ] **Step 3: Implement.** In `checks/live.mjs`, insert before `/**` of `checkSmoke`:

```js
/** Private paths (the site's PRIVATE_PATHS) must be 404 on a workers.dev preview: Access gates only the real host. */
export async function checkPrivate(base, { pages = [], fetchImpl = fetch, headers = {} } = {}) {
  const failures = [];
  for (const page of pages) {
    const url = new URL(page, base).toString();
    const res = await request(fetchImpl, url, { headers });
    if (res.status !== 404) failures.push(fail("private", url, `returned ${res.status}; a private path must be 404 on a preview URL`));
  }
  return failures;
}

```

In `checkSmoke`, change the signature to `{ pages = ["/"], privatePages = [], staging = false, fetchImpl = fetch, headers = {} } = {}`, and insert `  failures.push(...(await checkPrivate(base, { pages: privatePages, fetchImpl, headers })));` directly before the existing `failures.push(...(await checkNegotiationLive(…)))` line.

In `checks/cli.mjs`:
- add `checkPrivate` to the `./live.mjs` import (after `checkNegotiationLive`);
- add `    "private-pages": { type: "string", default: "[]" },` directly after the `mask` option;
- in `case "smoke"`, pass `privatePages: JSON.parse(opt["private-pages"])` alongside `pages`;
- insert before `  case "smoke": {`:

```js
  case "private": {
    need("base");
    const pages = JSON.parse(opt.pages);
    report(`private paths (${pages.length})`, await checkPrivate(opt.base, { pages }));
    break;
  }
```

In `.github/workflows/site-pr.yml`: add the input after `lighthouse-pages`:

```yaml
      private-pages:
        description: JSON array of paths that must be 404 on preview URLs (the site's PRIVATE_PATHS)
        type: string
        default: "[]"
```
Add `      PRIVATE_PAGES: ${{ inputs.private-pages }}` to the `live` job's `env`. Insert this step between `Markdown negotiation` and `Visual regression`:

```yaml
      - name: Private paths
        continue-on-error: true
        run: node .site-pipeline/checks/cli.mjs private --base "$CANDIDATE" --pages "$PRIVATE_PAGES" --json results/25-private.json
```
In `site-gate`, change `--expect 10-offline,20-negotiate,30-visual,40-lighthouse` to `--expect 10-offline,20-negotiate,25-private,30-visual,40-lighthouse`. With the default `[]`, the step reports `PASS private paths (0)` and still writes the file, so sites without private paths stay green.

In `.github/workflows/site-deploy.yml`: add the same `private-pages` input after `smoke-pages`, add `      PRIVATE_PAGES: ${{ inputs.private-pages }}` to the `deploy` job's `env`, and change the smoke line to:

```yaml
          node .site-pipeline/checks/cli.mjs smoke --base "$PREVIEW" --pages "$SMOKE_PAGES" --private-pages "$PRIVATE_PAGES" "${extra[@]}"
```

- [ ] **Step 4: Run to see them pass, and break-test.** `npx vitest run`. Expected: **`Tests 165 passed (165)`** (160 + 3 live + 2 workflows; recount the `it(` lines). Then change `if (res.status !== 404)` to `if (false)`. Expected: "fails a private page the preview serves…" and "is part of the deploy smoke" fail. Revert. Run `npx actionlint` if it's installed locally; otherwise `ci` runs it on push.

- [ ] **Step 5: Commit**

```powershell
git add -- checks/live.mjs checks/cli.mjs .github/workflows/site-pr.yml .github/workflows/site-deploy.yml test/live.test.js test/workflows.test.js
git commit -m "feat: check private paths are 404 on previews"
```

### Task 3: PDF build step and `pdf-links` check

**Files:** Modify `checks/offline.mjs` (insert after `checkFormspree`, register), `.github/workflows/site-pr.yml` and `site-deploy.yml` (Build step), `test/offline.test.js`, `test/workflows.test.js`.

**Interfaces:**
- Produces: `checkPdfLinks({ dir, host }) → failures[]`, exported and registered as `"pdf-links"`. The site contract: an optional npm script `build:pdf`, run after Hugo in PR and deploy builds; a failing script fails the build.

- [ ] **Step 1: Write the failing tests.** Append to `test/offline.test.js`:

```js
describe("pdf-links", () => {
  it("flags a same-site PDF link with no file in the build", async () => {
    const dir = site({ "about/index.html": '<!doctype html><title>About</title><a href="/files/cv.pdf">CV</a>' });
    expect(await run("pdf-links", dir)).toEqual([
      { check: "pdf-links", file: "about/index.html", message: "links /files/cv.pdf, which is not in the build" },
    ]);
  });

  it("passes absolute own-host, root-relative and page-relative PDF links that are built", async () => {
    const dir = site({
      "about/index.html": `<a href=https://${HOST}/files/cv.pdf>a</a><a href="../files/cv.pdf">b</a><link rel=alternate type=application/pdf href="cv.pdf">`,
      "files/cv.pdf": "%PDF",
      "about/cv.pdf": "%PDF",
    });
    expect(await run("pdf-links", dir)).toEqual([]);
  });

  it("ignores other hosts and links that are not PDFs", async () => {
    const dir = site({ "about/index.html": '<a href="https://other.test/x.pdf">x</a><a href="/missing/">y</a>' });
    expect(await run("pdf-links", dir)).toEqual([]);
  });

  it("reports a missing PDF once per page", async () => {
    const dir = site({ "about/index.html": '<a href="/cv.pdf">a</a><a href="/cv.pdf">b</a>' });
    expect(await run("pdf-links", dir)).toHaveLength(1);
  });
});
```

In `test/workflows.test.js`, append:

```js
describe("site builds", () => {
  it.each(["site-pr.yml", "site-deploy.yml"])("%s runs the site's optional build:pdf right after Hugo", (f) => {
    expect(text(f)).toMatch(/hugo --gc --minify\n(?: +#.*\n)* +npm run build:pdf --if-present\n/);
  });
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run test/offline.test.js test/workflows.test.js`. Expected: `OFFLINE_CHECKS["pdf-links"] is not a function` (the four new tests), and both `site builds` rows fail on `toMatch`.

- [ ] **Step 3: Implement.** In `checks/offline.mjs`, insert immediately before `export const OFFLINE_CHECKS = {`:

```js
/**
 * Every same-site link to a PDF in the built HTML (<a href>, <link href>) has a file in the build:
 * catches a PDF the build step failed to generate, or a template pointing at the wrong name.
 * minimal: PDFs only; upgrade path is every same-site href (the spec's lychee --offline check).
 */
export function checkPdfLinks({ dir, host }) {
  const failures = [];
  for (const rel of readdirSync(dir, { recursive: true })) {
    const path = String(rel).split("\\").join("/");
    if (!path.endsWith(".html")) continue;
    const page = new URL(path.replace(/(^|\/)index\.html$/, "$1"), `https://${host}/`);
    const seen = new Set();
    for (const [tag] of (readText(dir, path) ?? "").matchAll(/<(?:a|link)\b[^>]*>/gi)) {
      const href = attr(tag, "href");
      if (!href) continue;
      let url;
      try {
        url = new URL(href, page);
      } catch {
        continue; // not a URL; other checks own malformed markup
      }
      if (url.hostname !== host || !/\.pdf$/i.test(url.pathname) || seen.has(url.pathname)) continue;
      seen.add(url.pathname);
      if (!resolveUrlPath(dir, url.pathname)) failures.push(fail("pdf-links", path, `links ${url.pathname}, which is not in the build`));
    }
  }
  return failures;
}

```
Add `  "pdf-links": checkPdfLinks,` as the last entry of `OFFLINE_CHECKS`.

In **both** `site-pr.yml` and `site-deploy.yml`, change the `Build` step's `run:` block to:

```yaml
        run: |
          git config core.quotepath false
          hugo --gc --minify
          # A site that ships generated files (the resume PDF) defines build:pdf. The pdf-links offline
          # check fails the run if a linked PDF is still missing afterwards.
          npm run build:pdf --if-present
```
`site-weekly.yml` stays as it is. Its link check excludes the site's own host, and the canary doesn't need the PDF.

- [ ] **Step 4: Run to see them pass, then prove the tests bite.** `npx vitest run`. Expected: **`Tests 172 passed (172)`** (165 + 4 `pdf-links` + 1 automatic "GOOD fixture passes pdf-links" + 2 `site builds` rows; recount). Then replace `if (!resolveUrlPath(dir, url.pathname))` with `if (false)`. Expected: only "flags a same-site PDF link…" and "reports a missing PDF once per page" fail. Revert.

- [ ] **Step 5: Run against real builds.** These cases were observed on scratch copies on 2026-09-25:

Each site is built from `origin/main` through `git archive`, never from its working tree: BrianBK.ing's checkout was on `feature/resume-v3` at planning time.

```powershell
foreach ($s in @(@{r='W3BBK.us';h='w3bbk.us';id=''},@{r='BBKing.net';h='bbking.net';id=''},@{r='KingFamily';h='kingfamily.info';id='mgeggkzw'},@{r='BrianBK.ing';h='brianbk.ing';id='mgeggkzw'})) {
  $src = "$env:TEMP\w4src-$($s.r)"; if (Test-Path $src) { Remove-Item -Recurse -Force $src }; New-Item -ItemType Directory $src | Out-Null
  git -C "P:\Family_Websites\$($s.r)" fetch --quiet origin; git -C "P:\Family_Websites\$($s.r)" archive origin/main | tar -x -C $src
  Push-Location $src; hugo --gc --minify --destination "$env:TEMP\w4-$($s.r)" --quiet --cleanDestinationDir; Pop-Location
  "== $($s.r)"; node checks\cli.mjs offline --dir "$env:TEMP\w4-$($s.r)" --host $s.h --formspree-id $s.id; "exit=$LASTEXITCODE"
}
```
Expected: W3BBK, BBKing and KingFamily each print `PASS` and `exit=0`. BrianBK.ing prints `FAIL` and `exit=1`, with exactly three lines: two `_headers:6: Link points at kingfamily.info` (Task 6 fixes these) and `resume/index.html: links /resume/brian_b_king_resume.pdf, which is not in the build` (CI's `build:pdf` supplies the file).

- [ ] **Step 6: Commit**

```powershell
git add -- checks/offline.mjs .github/workflows/site-pr.yml .github/workflows/site-deploy.yml test/offline.test.js test/workflows.test.js
git commit -m "feat: build site PDFs and check PDF links"
```

### Task 4: Document, then release v1.2.0 — ask Brian first

**Files:** `README.md`, `package.json`, `.agents/specs/2026-09-23-workers-ci-pipeline-design.md`.

- [ ] **Step 1: README.** Add this after the **Formspree** paragraph:

```markdown

**Private paths.** A path a zone Access app gates in production (e.g. `/resume`) must be listed in
the site's `wrangler.jsonc` as `PRIVATE_PATHS`, both in `vars` and in `env.staging.vars`, because
wrangler does not inherit `vars` into environments. The Worker answers 404 for those paths on any
`*.workers.dev` host, since Access does not cover preview URLs. List the same paths, plus any file
under them, in the `private-pages` input of `pr.yml` and `deploy.yml`. The PR checks and the
pre-promotion smoke then prove the 404.

**Generated files.** A site that generates files after Hugo (the résumé PDF) defines an npm script
`build:pdf`. The PR and deploy builds run it after Hugo, and a failure fails the build. The offline
`pdf-links` check fails any build in which a same-site `.pdf` link has no file.
```

- [ ] **Step 2: Spec.** Append these rows to the **Revisions** table:

```markdown
| Private paths | Opt-in `PRIVATE_PATHS` Worker variable: 404 on `*.workers.dev` for paths a zone Access app gates in production (`/resume` on BrianBK.ing and JillK.ing), proven by a `private-pages` live check on every PR preview and every pre-promotion smoke. | Access doesn't cover preview URLs. Putting Access on them with a CI service token failed in a spike (token refused, 3 runs), and the token would reach third-party hosts through Playwright/Lighthouse headers (Brian, wave 4 planning). |
| PDF | No `pdf: true` input. An optional site npm script, `build:pdf`, runs after Hugo in PR and deploy builds, and the offline `pdf-links` check fails a build with a linked PDF missing. | One convention with no configuration; fails closed through the page's own link. |
```

- [ ] **Step 3: Bump and commit.** In `package.json`, set `"version": "1.2.0"`. Run `npx vitest run` → 172 passing. Then:

```powershell
git add -- README.md package.json .agents/specs/2026-09-23-workers-ci-pipeline-design.md
git commit -m "chore: release v1.2.0"
```

- [ ] **Step 4: Merge and tag** (go-ahead first):

```powershell
git switch main
git merge --ff-only feature/private-paths-pdf
git tag -a v1.2.0 -m "v1.2.0: private paths, PDF build step, pdf-links check"
```
*Brian runs* `git -C P:\Family_Websites\site-pipeline push origin main v1.2.0`. Claude then runs `gh run watch --repo brianbking/site-pipeline --exit-status`. Expected: `ci` green (vitest + actionlint). Then `git branch -d feature/private-paths-pdf`.

---

## Part B — BrianBK.ing and JillK.ing

Run each task for **both** sites, BrianBK.ing first. Per-site values:

| Value | BrianBK.ing | JillK.ing |
|---|---|---|
| Repo / local path | `brianbking/BrianBK.ing` / `P:\Family_Websites\BrianBK.ing` | `brianbking/JillK.ing` / `P:\Family_Websites\JillK.ing` |
| Worker / staging Worker | `brianbking` / `brianbking-staging` | `jillking` / `jillking-staging` |
| Host / staging host | `brianbk.ing` / `staging.brianbk.ing` | `jillk.ing` / `staging.jillk.ing` |
| `formspreeId` | `mgeggkzw` (shared with KingFamily, reCAPTCHA on) | `xyzggdoa` (reCAPTCHA unknown; Review Focus 4) |
| Private pages | `["/resume/", "/resume/brian_b_king_resume.pdf"]` | `["/resume/", "/resume/jill_king_resume.pdf"]` |
| Extra devDependency | `"smol-toml": "^1.8.0"` (already in `package.json`) | none |
| Nav `target-size` fix | yes (18 px icon links on `/contact/`) | no (passes) |
| Tests to delete | `test/middleware.test.js`, `test/negotiate.test.js` (they import `functions/`) | none |

### Task 5: Preconditions — stop and ask Brian

- [ ] **Step 1: Report and ask.** State on 2026-09-25, which Brian decides per repo, one question at a time:
  - **BrianBK.ing** is on `feature/resume-v3`, 15 commits ahead of `main`, with no remote branch. Its uncommitted items are `M .agents/context/learnings.md` and the untracked `.agents/` workspace dirs, which belong to another session. There is also a registered worktree for `fix/puppeteer-advisories` (at `main`) under another session's scratchpad. `origin/development` exists. `resume-v3` links `resume/v3/<basename>.pdf`, which the PDF script never writes (Review Focus 5). Merging it before wave 4 means fixing that link or the script first.
  - **JillK.ing** is on `fix/puppeteer-advisories`, which stages `@sparticuz/chromium ^153` + `puppeteer-core ^25.11` and the `headless: 'shell'` launch fix in `scripts/generate-resume-pdf.js`. `origin/development` exists.
  - Recommendation: finish `fix/puppeteer-advisories` on **both** sites first, so CI builds both PDFs with the same patched pair. BrianBK.ing is still on `^130` / `^22` without the shell fix. Park `feature/resume-v3` until after the cutover.
- [ ] **Step 2: Proceed** once `git status --short --branch` shows `## main...origin/main`, apart from untracked `.agents/` and `_*.url`, which aren't part of this work. Then `git switch -c feature/workers-ci` in each repo.

### Task 6: Site fixes — a11y to ≥ 95, contact subject, `_headers` host

**Files** (each repo): `layouts/partials/home/header.html`, `content/_index.html`, `layouts/partials/header.html`, `layouts/contact/single.html`, `layouts/partials/contact-form.html`, `assets/sass/dark/styles.scss`, `static/_headers`, and `assets/sass/styles.scss` (BrianBK.ing only).

- [ ] **Step 1: Baseline.** Build to `$env:TEMP\w4a-<site>` and run Lighthouse `--only-categories=accessibility` on `/` and `/contact/`, as in wave 2 Task 1 Steps 2–3 (port 8799). Measured on 2026-09-25 (light): BrianBK.ing 94 / 85, JillK.ing 94 / 88. Dark (`--force-dark-mode --blink-settings=preferredColorScheme=0` in `chromeFlags`) adds `color-contrast` on `/contact/`, giving 81 / 85.

- [ ] **Step 2: Fix.** Every replacement matches exactly once per file (checked on 2026-09-25):

`layouts/partials/home/header.html`: the empty brand link (`link-name`). This keeps the wrapper span that wave 3 needed (`6593533`):
```html
        <span><a href="/" class="navbar-brand mb-0 fs-1 text-shadow fst-italic" tabindex="-1">&nbsp;</a></span>
```
→
```html
        <span><span class="navbar-brand mb-0 fs-1 text-shadow fst-italic" aria-hidden="true">&nbsp;</span></span>
```

`content/_index.html`: `<h5 class="cover-subheading">` → `<h2 class="cover-subheading">` and `</h5>` → `</h2>` (`heading-order`). `.cover-subheading` sets its own `font-size`, and Bootstrap gives every heading level the same margins, so this shouldn't render differently.

`layouts/partials/header.html`: the avatar has no alt, so its link has no name. Replace `<img src="/pop.png" class="m-0 p-0 align-bottom" width="50px" height="50px">` with `<img src="/pop.png" class="m-0 p-0 align-bottom" width="50px" height="50px" alt="{{ site.Params.profile.name }}">`.

`layouts/contact/single.html`: the breadcrumb's Home text is hidden on mobile. Replace
```html
<li class="breadcrumb-item"><a href="/"><span class="d-inline d-md-none"><i class="fa-solid fa-house"></i></span>
```
with
```html
<li class="breadcrumb-item"><a href="/" aria-label="Home"><span class="d-inline d-md-none"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
```

`layouts/partials/contact-form.html`: delete all 10 ` tabindex="N"` attributes. Check with `(Select-String -Path layouts\partials\contact-form.html -Pattern 'tabindex').Count` → `0`. Also fix the copy-pasted email subject, which currently labels every message with the wrong site (and BrianBK.ing shares its form ID with KingFamily). Replace `value="Contact Form submission from kingfamily.info"` with `value="Contact Form submission from {{ (urls.Parse site.BaseURL).Host }}"`. This renders `brianbk.ing` / `jillk.ing` (checked).

`assets/sass/dark/styles.scss`: insert immediately before the tab-indented `	/* reset */` line. Hover and active are included; that's the lesson from the wave 3 review:
```scss
	// body opacity 0.87 blends over a white canvas and lifted the default button colours under 4.5:1.
	// Hover and active are darkened too, or Bootstrap's stock hover would be lighter than the new base.
	#fs-frm .btn-success { --bs-btn-bg: #146c43; --bs-btn-border-color: #146c43; --bs-btn-hover-bg: #0f5132; --bs-btn-hover-border-color: #0f5132; --bs-btn-active-bg: #0f5132; --bs-btn-active-border-color: #0f5132; }
	#fs-frm .btn-secondary { --bs-btn-bg: #565e64; --bs-btn-border-color: #565e64; --bs-btn-hover-bg: #41464b; --bs-btn-hover-border-color: #41464b; --bs-btn-active-bg: #41464b; --bs-btn-active-border-color: #41464b; }

```

`static/_headers` line 6: replace both `https://kingfamily.info/` with `https://<host>/`.

**BrianBK.ing only**, append to `assets/sass/styles.scss`:
```scss

.navbar .nav-link {
	min-width: 24px; // icon-only links on mobile were 18px wide (Lighthouse target-size)
	text-align: center;
	position: relative; // above the oversized brand link, which overlapped the targets
	z-index: 1;
}
```

- [ ] **Step 3: Re-run and see it pass.** Repeat Step 1, light and dark. Expected: `a11y=100` on both pages, both sites, both themes (measured on scratch copies on 2026-09-25). Below 95 means stop and report the audit's `details.items[].node.explanation`. Stop the server and confirm nothing is listening on 8799.

- [ ] **Step 4: Commit** (each repo; for JillK.ing, leave `assets/sass/styles.scss` out):

```powershell
git add -- layouts/partials/home/header.html content/_index.html layouts/partials/header.html layouts/contact/single.html layouts/partials/contact-form.html assets/sass/dark/styles.scss static/_headers assets/sass/styles.scss
git commit -m "fix: bring pages to WCAG AA, fix site host"
```

`/resume/` also fails a11y (BrianBK.ing 82: `color-contrast`, `landmark-one-main`, `target-size`; JillK.ing 90). CI can't gate it because it's private, so it goes to the backlog (Task 11), not here.

### Task 7: Convert each repo to site-pipeline

Follow **wave 2 Task 2**, Steps 1 and 3–9, using the table values and `v1.2.0`. Skip Step 2: neither repo tracks `.hugo_build.lock`. Differences:

- **`package.json`** is replaced, keeping the PDF dependencies at whatever ranges `main` has after Task 5:
  ```json
  {
    "name": "brianbking",
    "private": true,
    "type": "module",
    "scripts": {
      "build": "hugo --gc --minify",
      "build:pdf": "node scripts/generate-resume-pdf.js",
      "dev": "hugo --gc --minify && wrangler dev --env=\"\""
    },
    "dependencies": {
      "@kingfamily/site-worker": "git+https://github.com/brianbking/site-pipeline.git#v1.2.0",
      "@sparticuz/chromium": "<main's range>",
      "puppeteer-core": "<main's range>"
    },
    "devDependencies": {
      "smol-toml": "^1.8.0",
      "wrangler": "^4.137.0"
    }
  }
  ```
  For JillK.ing: `"name": "jillking"`, and no `smol-toml`. The old `generate-resume-pdf` script name goes; nothing calls it except `build.sh`, which is deleted. `build:pdf` can't run on Windows (the Chromium build is Linux-only), so local verification stops at Hugo.
- **`src/worker.js` is replaced, not created.** The old file served markdown for any `Accept` containing `text/markdown`, and never ran for HTML routes.
- **`wrangler.jsonc`** is wave 2's file with the table's names and host, plus the private paths at **both** levels:
  ```jsonc
    "vars": { "PRIVATE_PATHS": ["/resume"] },
  ```
  added after `"preview_urls": true,` at the top level, and in `env.staging` as `"vars": { "SITE_ENV": "staging", "PRIVATE_PATHS": ["/resume"] },`. It drops `vars.HUGO_VERSION`.
- **`pr.yml`** adds, after `worker:`:
  ```yaml
      visual-pages: '["/", "/contact/"]'
      lighthouse-pages: '["/", "/contact/"]'
      private-pages: '["/resume/", "/resume/brian_b_king_resume.pdf"]'
  ```
  **`deploy.yml`**: `smoke-pages: '["/", "/contact/", "/llms.txt", "/.well-known/agent-card.json"]'`, plus the same `private-pages` line. `/resume/` is never in a visual, Lighthouse or smoke list, because it's 404 on every preview.
- **`.gitignore`**: append `*.url`, `.wrangler/` (BrianBK.ing already has it), `.site-pipeline/` and `gate-out/`.
- **Step 6 deletes:** `git rm -r -- functions static/_routes.json build.sh`, plus the table's tests for BrianBK.ing.
- **Docs (Step 7).** Neither repo has a `CLAUDE.md`, and `README.md` is only a status badge. Append to `README.md`:
  ```markdown

  ## Deployment

  GitHub Actions builds and deploys through [site-pipeline](https://github.com/brianbking/site-pipeline):
  PRs into `staging` get a preview URL and checks, `staging` deploys to staging.<host> (Access login),
  and `main` deploys to production. `npm run build:pdf` generates the résumé PDF after Hugo, in CI
  only. `/resume` is private: Cloudflare Access gates it on the real hostname, and the Worker's
  `PRIVATE_PATHS` hides it on every preview URL.
  ```
  Leftover check, which must cover `static/` and `layouts/`: `Select-String -Path README.md,static\*.*,static\.well-known\*,layouts\*.* -Pattern 'Cloudflare Pages|Pages Functions|functions/|build\.sh|_routes'` returns nothing.
- **Step 8 verification:** the offline run passes the form ID: `node ..\site-pipeline\checks\cli.mjs offline --dir public --host <host> --formspree-id <id>`. It must print exactly one failure, the `pdf-links` line for the résumé PDF, because Windows can't build the PDF. Confirm by hand that this is the only failure. Both dry runs must list `env.PRIVATE_PATHS` (production **and** staging). With both `wrangler dev` servers up, also run `node ..\site-pipeline\checks\cli.mjs private --base http://127.0.0.1:8787 --pages '["/resume/"]'`. Expected: **FAIL** `returned 200`, because localhost isn't `workers.dev`. That proves the real-hostname path, and the preview path is proven in CI.
- **Step 9 commit** stages the replaced `src/worker.js` and the deleted tests. Message: `feat: deploy via site-pipeline on Workers`.

### Task 8: Accounts and dashboard — Brian, with Claude guiding

Follow **wave 3 Task 6** for each repo, with these differences:

- [ ] **Step 1: Branches.** Ask about `origin/development` (Task 5). *Brian runs* `git -C <path> push origin main:staging`.
- [ ] **Step 2: Label and Actions permissions:** as in wave 2, with `--repo <repo>`.
- [ ] **Step 3: Secrets.** Run wave 3's `Set-KingFamilySecrets.ps1`, saved as `$env:TEMP\Set-SiteSecrets.ps1` with `-Repo` passed per site. *Brian runs* it once per repo. Verify with both `gh secret list` commands.
- [ ] **Step 4: Disconnect Workers Builds now,** not at cutover: dashboard → the Worker → Settings → Build → disconnect. It builds non-production branches too (wave 3 finding), so leaving it connected puts red checks on `feature/workers-ci`, `staging` and `main`. Production stays on its current version, which equals `main` (checked 2026-09-25), until Task 10. Reconnecting it is the rollback.
- [ ] **Step 5: Bootstrap the staging Worker** (Brian's terminal): `npm run build`, then `npx wrangler deploy --env staging`. Expected: `<worker>-staging (custom domain) staging.<host>`. `staging.<host>` doesn't resolve today, and neither zone has a wildcard record (curl failed to resolve both on 2026-09-25). If wrangler reports a DNS conflict, stop.
- [ ] **Step 6: Preview URLs toggle** on the production Worker. Verify in Brian's terminal: `npx wrangler versions upload --env=""` prints a `Version Preview URL:` line. Then check that URL **by hand**: `<preview>/` returns 200, and `<preview>/resume/`, `<preview>/x/..%2Fresume/` and `<preview>/%2572esume/` each return **404**. Also check the preview URL of one **old** Workers Builds version (`npx wrangler versions list --env=""` → `<first 8 hex of its id>-<worker>.catastrophic.workers.dev/resume/`). Old versions predate `PRIVATE_PATHS`, so the toggle may expose `/resume/` on them. If it returns 200, tell Brian: the URL needs the version id to find, but it's public. The options are to accept that, or to turn the toggle off again and give up PR previews for this site (final review, 2026-09-25).
- [ ] **Step 7: Access for staging.** No application exists yet. Go to Zero Trust → Access → Applications → Add → Self-hosted, domain `staging.<host>`, policy *Allow*, Include *Emails*. For JillK.ing, Brian decides whose emails to include. Verify with wave 2's curl: `302 https://catastrophic.cloudflareaccess.com/...`.
- [ ] **Step 8: Production résumé Access is unchanged:** curl `https://<host>/resume/` with a browser UA. Expected: `302 https://catastrophic.cloudflareaccess.com/...` (as on 2026-09-24).

### Task 9: First PRs through the pipeline

Follow **wave 2 Task 4** per repo, titled `feat: deploy via site-pipeline on Workers`, with the body `Wave 4 of site-pipeline (v1.2.0).`. Beyond wave 2's checks:

- [ ] **Step 1: The `build` job** logs `PDF written to …/public/resume/<basename>.pdf`, and the offline row passes, which covers `pdf-links`. A red build here is Review Focus 1: BLOCKED + `/systematic-debugging`, and never `|| true`.
- [ ] **Step 2: The `Private paths` row** passes: both pages are 404 on `pr-<N>-<worker>.catastrophic.workers.dev`. Also check by hand with curl that `<candidate>/resume/` is 404 and `<candidate>/` is 200.
- [ ] **Step 3: Canary for JillK.ing** (go-ahead first; this may send Jill one real email): `node ..\site-pipeline\checks\cli.mjs formspree-canary --dir public --host jillk.ing`. A `PASS` with reCAPTCHA refusal sends no email. A plain `PASS` means the form accepted the post, and from cutover on the weekly canary will email Jill every Monday. Brian then decides whether to turn on reCAPTCHA for `xyzggdoa`, accept the emails, or exclude the canary for this site (a backlog item; no code in this wave). BrianBK.ing's `mgeggkzw` refuses canaries with a reCAPTCHA error, which the canary counts as a pass (wave 3), so it needs no test here.
- [ ] **Step 4: Visual.** Production equals `main` (2026-09-25), so every diff comes from Task 6. Expect small changes: the home header brand, and the mobile navbar on BrianBK.ing. `h5` → `h2` should render the same; a diff there is a finding. Label `approved-visual-change` only after Brian reviews `visual-diffs`.

### Task 10: Cutover, stale Pages project, exit criteria — ask Brian before each merge

Follow **wave 2 Task 5** per repo, minus its Step 2 (Workers Builds was disconnected in Task 8). Additions:

- [ ] Step 4's live checks target `https://<host>/`, and they add `https://<host>/resume/` → `302` to Access.
- [ ] Step 5 adds `gh workflow run weekly.yml --repo <repo>`, which is green only after the Task 9 Step 3 canary decision.
- [ ] **Delete `brianbking.pages.dev`** (go-ahead first). It still serves an old copy of BrianBK.ing publicly (200 on 2026-09-25), with `/resume/` behind Access. In the dashboard, open Workers & Pages → `brianbking` (Pages) → Custom domains, which must be empty (spec: delete only then). Delete the project, then delete any Access application whose domain is `brianbking.pages.dev`. `jillking.pages.dev` doesn't resolve, so there's nothing to do for JillK.ing.
- [ ] **Exit and findings.** Wave 2's exit criteria hold for both sites. Also, `<preview>/resume/` is 404 and `https://<host>/resume/` is 302. Append `## Wave 4 — BrianBK.ing + JillK.ing (YYYY-MM-DD)` to `.agents/findings/2026-09-23-w3bbk-pilot.md`, recording: PDF on the runner (Review Focus 1), the Jill canary outcome, anything that differed from wave 3, and Actions minutes. Commit in site-pipeline with `docs: record wave 4 findings`.

### Task 11: Close out

- [ ] In `.agents/tasks/backlog.md`: move Wave 4 to **Completed** (`_Completed: YYYY-MM-DD_`, plan and findings links) and add the `v1.2.0` release. Add to **Backlog**: `/resume/` a11y on both sites (not CI-gated), `feature/resume-v3`'s `resume/v3/*.pdf` link (if still open), and the canary exclusion if Task 9 Step 3 asked for one. Commit with `docs: mark wave 4 and v1.2.0 done`.

---

## Open decisions (Brian)

- **Task 5 branches:** `feature/resume-v3` and `fix/puppeteer-advisories` on BrianBK.ing, `fix/puppeteer-advisories` on JillK.ing, and `origin/development` on both.
- **Whose emails** the `staging.jillk.ing` Access policy allows.
- **The JillK.ing canary** (Task 9 Step 3).
- **Moving W3BBK, BBKing and KingFamily to `v1.2.0`.** It's optional (nothing changes for them), and Dependabot has never opened those pin PRs (wave 3 finding), so it would be manual pin PRs.
