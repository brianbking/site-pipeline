# site-pipeline Phase 0 + W3BBK.us Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared `site-pipeline` repo (canonical Worker, check suite, reusable GitHub Actions workflows) and move W3BBK.us onto it as the pilot, from PR preview through staging to production.

**Architecture:** `site-pipeline` is a public repo tagged `vX.Y.Z`. Site repos call its reusable workflows at one tag; CI checks the repo out at that tag and installs the Worker from it. Every Node-based live check runs against `workers.dev` version preview URLs, and only a curl check touches the real hostname, because the family zones 403-challenge Node's HTTP client (verified 2026-09-23).

**Tech Stack:** Node 24, Vitest 5, Wrangler 4.137+, Hugo extended 0.162.0 + Dart Sass 1.89.2 (`toolchain.json`), Playwright + pixelmatch, Lighthouse 13 + chrome-launcher, fast-xml-parser, GitHub Actions, lychee.

**Spec:** `.agents/specs/2026-09-23-workers-ci-pipeline-design.md` (with its "Revisions from planning" section).

**Scope:** Phase 0 and wave 1 only. Waves 2–5 (BBKing.net, KingFamily, BrianBK.ing + JillK.ing, MasonBK.ing) each get a short plan written after Task 11's findings. Formspree checks arrive with wave 3 and the résumé-PDF build step with wave 4, because the pilot site has neither.

## Global Constraints

- All code in this plan was run in a scratch project on 2026-09-23: 92 Vitest tests green, all workflows `actionlint` 1.7.12-clean, W3BBK config smoke-tested under `wrangler dev`. **Transcribe files exactly.** If code and a test disagree, the test wins; stop and report instead of editing the test.
- Node `>=24`; ESM only (`"type": "module"`).
- `toolchain.json` pins Hugo `0.162.0` and Dart Sass `1.89.2`, the versions production was built with, so the first visual baseline compares like with like. `toolchain-bump.yml` proposes newer ones.
- Every site-pipeline workflow pin in a site repo uses the same tag. `site-pr.yml` fails the build if two differ.
- Production wrangler commands pass `--env=""` (`--env=` in YAML) explicitly. Wrangler warns when environments exist and none is named.
- Secrets never go in files. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` live as repo Actions secrets **and** Dependabot secrets.
- Commits follow Conventional Commits; the summary line is ≤ 50 characters (measure it); no `Co-Authored-By` trailer; stage by explicit path, never `git add -A`.
- Windows host: run commands through the PowerShell tool unless a step says Bash. `site-pipeline` has `.gitattributes` `* text=auto eol=lf`.
- Anything outward-facing (creating the GitHub repo, pushing, tagging, dashboard changes, merging) happens only after Brian says go for that task.

## Review Focus

1. **Hidden files dropped from the deploy artifact.** `upload-artifact@v4` skips dotfiles by default, so `public/.well-known/` would vanish silently. Pinned by `include-hidden-files: true` in `site-pr.yml`, and by W3BBK's smoke pages including `/.well-known/agent-card.json` (Task 8, `deploy.yml`).
2. **Staging config leaking into production.** A production response carrying `noindex` would de-index the site. Pinned by `checkSmoke` failing production on `noindex` (Task 4 test "fails production that is noindex") and by the curl hostname check (Task 6).
3. **Auto-merged Dependabot PRs never deploying.** A merge made with `GITHUB_TOKEN` triggers no workflows. `dependabot-merge` dispatches `deploy.yml` on `staging`, and Task 11 Step 5 exercises that dispatch path by hand.
4. **CI traffic polluting analytics.** Previews are production builds with GTM. Playwright aborts and Lighthouse blocks the analytics hosts (`BLOCKED_HOSTS`, `blockedUrlPatterns`); the negotiation and smoke checks never execute JS.
5. **Query strings on negotiated URLs.** `/?utm_source=feed` with `Accept: text/markdown` must still return markdown. Pinned by the worker test "still negotiates when the URL carries a query string" (Task 2).

---

## File Structure

`P:\Family_Websites\site-pipeline\` (repo exists; spec committed on `main`):

| File | Responsibility |
|---|---|
| `package.json`, `package-lock.json` | Package `@kingfamily/site-worker`; exports the Worker; check tooling as devDependencies so sites installing the git dependency get only `worker/` |
| `toolchain.json` | Hugo + Dart Sass versions for every site build |
| `worker/negotiate.js` | Pure negotiation helpers, byte-identical to the six repos' `functions/lib/negotiate.js` |
| `worker/index.js` | `fetch` handler: negotiation, `Link` advertisement, staging `noindex` |
| `checks/lib/build.mjs` | Failure records, build-dir path resolution |
| `checks/offline.mjs` | Offline checks against `public/` |
| `checks/live.mjs` | Checks against a deployed URL: negotiation, smoke, security.txt |
| `checks/visual.mjs`, `checks/lighthouse.mjs` | Gate logic plus the Playwright/Lighthouse runners |
| `checks/lib/ci.mjs` | Wrangler output parsing, issue decisions, PR summary |
| `checks/cli.mjs` | Single CLI the workflows call |
| `test/*.test.js` | Vitest suites, one per module group |
| `.github/actions/setup/action.yml` | Composite: Node, pipeline deps, toolchain, site deps at the pinned ref, browsers |
| `.github/workflows/site-pr.yml`, `site-deploy.yml`, `site-weekly.yml` | Reusable workflows the sites call |
| `.github/workflows/ci.yml`, `toolchain-bump.yml` | This repo's own CI and the weekly toolchain check |
| `README.md` | What a site repo needs; workflow inputs |

`P:\Family_Websites\W3BBK.us\` changes: create `package.json`, `package-lock.json`, `src/worker.js`, `.github/workflows/{pr,deploy,weekly}.yml`, `.github/dependabot.yml`; replace `wrangler.jsonc`; edit `.gitignore`, `CLAUDE.md`, `README.md`; delete `functions/`, `static/_routes.json`, `build.sh`.

---

## Phase 0 — site-pipeline

Work in `P:\Family_Websites\site-pipeline` on branch `feature/phase0`:

```powershell
Set-Location P:\Family_Websites\site-pipeline
git switch -c feature/phase0
```

### Task 1: Package scaffold and negotiate.js characterization

**Files:**
- Create: `package.json`, `toolchain.json`, `test/negotiate.test.js`
- Create (copied, not typed): `worker/negotiate.js`
- Generated: `package-lock.json`

**Interfaces:**
- Produces: `worker/negotiate.js` exports `parseAccept(header) -> {type, q}[]`, `prefersMarkdown(header) -> boolean`, `mdSiblingPath(pathname) -> string|null`, `estimateTokens(text) -> number`.

- [ ] **Step 1: Write `package.json` and `toolchain.json`**

`package.json`:

````json
{
  "name": "@kingfamily/site-worker",
  "version": "0.1.0",
  "scripts": {
    "test": "vitest run"
  },
  "license": "UNLICENSED",
  "type": "module",
  "devDependencies": {
    "chrome-launcher": "^1.2.1",
    "fast-xml-parser": "^5.11.1",
    "lighthouse": "^13.5.0",
    "pixelmatch": "^7.2.0",
    "playwright": "^1.63.0",
    "pngjs": "^7.0.0",
    "vitest": "^5.0.1"
  },
  "private": true,
  "exports": {
    ".": "./worker/index.js",
    "./negotiate": "./worker/negotiate.js"
  },
  "files": [
    "worker"
  ],
  "engines": {
    "node": ">=24"
  }
}
````

`toolchain.json`:

````json
{
  "hugo": "0.162.0",
  "dartSass": "1.89.2"
}
````

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `package-lock.json` created, `found 0 vulnerabilities`, and `npm ls --depth=0` lists the seven devDependencies.

- [ ] **Step 3: Write the characterization test**

`test/negotiate.test.js`:

````js
// Characterization tests: pin the behaviour of the canonical negotiate.js
// exactly as it shipped in functions/lib/negotiate.js (all six repos, md5 E3EFF2C1).
import { describe, it, expect } from "vitest";
import { parseAccept, prefersMarkdown, mdSiblingPath, estimateTokens } from "../worker/negotiate.js";

describe("parseAccept", () => {
  it("returns [] for null, undefined and empty", () => {
    expect(parseAccept(null)).toEqual([]);
    expect(parseAccept(undefined)).toEqual([]);
    expect(parseAccept("")).toEqual([]);
  });
  it("defaults q to 1 and lowercases types", () => {
    expect(parseAccept("Text/HTML")).toEqual([{ type: "text/html", q: 1 }]);
  });
  it("reads q values and ignores other params", () => {
    expect(parseAccept("text/markdown;charset=utf-8;q=0.5")).toEqual([{ type: "text/markdown", q: 0.5 }]);
  });
  it("keeps q=1 when q is not a number", () => {
    expect(parseAccept("text/html;q=abc")).toEqual([{ type: "text/html", q: 1 }]);
  });
  it("drops empty entries", () => {
    expect(parseAccept("text/html,,")).toEqual([{ type: "text/html", q: 1 }]);
  });
});

describe("prefersMarkdown", () => {
  it.each([
    ["text/markdown", true],
    ["text/x-markdown", true],
    ["text/markdown, text/html;q=0.9", true],
    ["text/html, text/markdown;q=0.9", false],
    ["text/markdown, text/html", false], // equal q -> HTML (browser-safe)
    ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", false],
    ["*/*", false],
    ["text/markdown;q=0", false],
    ["", false],
    [null, false],
  ])("%s -> %s", (header, expected) => {
    expect(prefersMarkdown(header)).toBe(expected);
  });
});

describe("mdSiblingPath", () => {
  it.each([
    ["/", "/index.md"],
    ["/about/", "/about/index.md"],
    ["/about", "/about/index.md"],
    ["about/", "/about/index.md"],
    ["/css/site.css", null],
    ["/index.md", null],
    ["", null],
  ])("%s -> %s", (input, expected) => {
    expect(mdSiblingPath(input)).toBe(expected);
  });
});

describe("estimateTokens", () => {
  it("is ceil(length / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
  it("treats null as empty", () => {
    expect(estimateTokens(null)).toBe(0);
  });
});
````

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run test/negotiate.test.js`
Expected: FAIL, with an error that `../worker/negotiate.js` cannot be found.

- [ ] **Step 5: Copy the canonical module verbatim and confirm the bytes**

```powershell
New-Item -ItemType Directory -Force worker | Out-Null
Copy-Item P:\Family_Websites\BBKing.net\functions\lib\negotiate.js worker\negotiate.js
(Get-FileHash worker\negotiate.js -Algorithm MD5).Hash.Substring(0,8)
```
Expected: `E3EFF2C1`, the hash shared by all six repos' copies. Do not edit this file.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/negotiate.test.js`
Expected: PASS, 24 tests.

- [ ] **Step 7: Prove the suite can fail (characterization tests are green on first run)**

Temporarily change `mdQ > htmlQ` to `mdQ >= htmlQ` in `worker/negotiate.js`, then run `npx vitest run test/negotiate.test.js`.
Expected: FAIL naming `prefersMarkdown > text/markdown, text/html -> false`.
Then restore by re-running Step 5's `Copy-Item` and confirm the hash is `E3EFF2C1` again.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json toolchain.json worker/negotiate.js test/negotiate.test.js
git commit -m "test: characterize canonical negotiate.js"
```

### Task 2: Worker fetch handler

**Files:**
- Create: `worker/index.js`, `test/worker.test.js`

**Interfaces:**
- Consumes: Task 1's `prefersMarkdown`, `mdSiblingPath`, `estimateTokens`.
- Produces: `worker/index.js` default export `{ fetch(request, env) }` and named `handle(request, env)`. `env.ASSETS.fetch(Request) -> Response` is the static-assets binding; `env.SITE_ENV === "staging"` switches on staging behaviour.

- [ ] **Step 1: Write the failing test**

`test/worker.test.js`:

````js
import { describe, it, expect } from "vitest";
import worker from "../worker/index.js";

const BASE = "https://site.test";
const HTML = "<!doctype html><title>t</title>";
const MD = "# Home\n\nHello world.\n";

/** Stub of the Workers static-assets binding: pathname -> { body, type }. */
function makeAssets(files, { throwOn } = {}) {
  return {
    async fetch(input) {
      const req = input instanceof Request ? input : new Request(input);
      const { pathname } = new URL(req.url);
      if (throwOn && pathname.endsWith(throwOn)) throw new Error("assets down");
      const key = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const file = files[key];
      if (!file) return new Response("not found", { status: 404, headers: { "Content-Type": "text/html" } });
      const headers = { "Content-Type": file.type, ...(file.headers || {}) };
      return new Response(req.method === "HEAD" ? null : file.body, { status: 200, headers });
    },
  };
}

const SITE = {
  "/index.html": { body: HTML, type: "text/html; charset=utf-8" },
  "/index.md": { body: MD, type: "text/markdown; charset=utf-8", headers: { ETag: '"abc"' } },
  "/about/index.html": { body: HTML, type: "text/html; charset=utf-8", headers: { Vary: "Accept-Encoding" } },
  "/robots.txt": { body: "User-agent: *\nAllow: /\n", type: "text/plain" },
  "/css/site.css": { body: "body{}", type: "text/css" },
};

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const call = (path, { method = "GET", accept = BROWSER, env = {}, files = SITE, throwOn } = {}) =>
  worker.fetch(new Request(BASE + path, { method, headers: { Accept: accept } }), {
    ASSETS: makeAssets(files, { throwOn }),
    ...env,
  });

describe("markdown negotiation", () => {
  it("serves the markdown sibling when markdown is preferred", async () => {
    const res = await call("/", { accept: "text/markdown" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe(MD);
    expect(res.headers.get("X-Markdown-Tokens")).toBe(String(Math.ceil(MD.length / 4)));
    expect(res.headers.get("Content-Signal")).toBe("ai-train=no, search=yes, ai-input=yes");
    expect(res.headers.get("Content-Usage")).toBe("train-ai=n, search=y, ai-input=y");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("ETag")).toBe('"abc"');
  });

  it("still negotiates when the URL carries a query string", async () => {
    const res = await call("/?utm_source=feed", { accept: "text/markdown" });
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe(MD);
  });

  it("answers HEAD with headers only and the GET Content-Length", async () => {
    const res = await call("/", { method: "HEAD", accept: "text/markdown" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("Content-Length")).toBe(String(new TextEncoder().encode(MD).length));
    expect(res.body).toBeNull();
  });

  it("gives HTML when markdown and HTML have equal q", async () => {
    const res = await call("/", { accept: "text/markdown, text/html" });
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });

  it("falls back to HTML when the markdown sibling is missing", async () => {
    const res = await call("/about/", { accept: "text/markdown" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });

  it("falls back to HTML when the assets binding throws for the markdown fetch", async () => {
    const res = await call("/", { accept: "text/markdown", throwOn: ".md" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });

  it("does not negotiate for POST", async () => {
    const res = await call("/", { method: "POST", accept: "text/markdown" });
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });
});

describe("HTML advertisement", () => {
  it("adds the markdown alternate Link and Vary: Accept to HTML pages", async () => {
    const res = await call("/");
    expect(res.headers.get("Link")).toBe(`<${BASE}/index.md>; rel="alternate"; type="text/markdown"`);
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(await res.text()).toBe(HTML);
  });

  it("keeps an existing Vary value", async () => {
    const res = await call("/about/");
    expect(res.headers.get("Vary")).toBe("Accept-Encoding, Accept");
  });

  it("does not advertise on non-HTML files", async () => {
    const res = await call("/css/site.css");
    expect(res.headers.get("Link")).toBeNull();
  });

  it("does not advertise on 404s", async () => {
    const res = await call("/missing/");
    expect(res.status).toBe(404);
    expect(res.headers.get("Link")).toBeNull();
  });
});

describe("staging", () => {
  const env = { SITE_ENV: "staging" };

  it("marks HTML responses noindex", async () => {
    const res = await call("/", { env });
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Link")).toContain("rel=\"alternate\"");
  });

  it("marks markdown responses noindex", async () => {
    const res = await call("/", { env, accept: "text/markdown" });
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("serves a disallow-all robots.txt", async () => {
    const res = await call("/robots.txt", { env });
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("leaves production robots.txt and headers alone", async () => {
    const res = await call("/robots.txt");
    expect(await res.text()).toBe("User-agent: *\nAllow: /\n");
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/worker.test.js`
Expected: FAIL, with an error that `../worker/index.js` cannot be found.

- [ ] **Step 3: Write the implementation**

`worker/index.js` is a port of `functions/_middleware.js`: `next()` becomes `env.ASSETS.fetch(request)`, and the staging behaviour is new.

````js
// Canonical Worker for all King-family sites (ported from functions/_middleware.js).
// (a) Strict Accept-based Markdown negotiation, with AI-crawler signal headers
//     and a ~token-count hint.
// (b) Advertise the Markdown alternate via a Link header on HTML documents.
// (c) Staging only (env.SITE_ENV === "staging"): noindex everything, block robots.
import { prefersMarkdown, mdSiblingPath, estimateTokens } from "./negotiate.js";

// AI-crawler signals attached to served markdown (mirrors site _headers intent).
const MD_SIGNALS = {
  "Content-Signal": "ai-train=no, search=yes, ai-input=yes",
  "Content-Usage": "train-ai=n, search=y, ai-input=y",
};

const STAGING_ROBOTS = "User-agent: *\nDisallow: /\n";

/** Absolute URL of the Markdown sibling for a request URL, or null. */
function mdUrlFor(requestUrl) {
  const url = new URL(requestUrl);
  const mdPath = mdSiblingPath(url.pathname);
  if (!mdPath) return null;
  url.pathname = mdPath;
  return url.toString();
}

/** Add "Accept" to Vary without dropping existing values. */
function addVaryAccept(headers) {
  const existing = headers.get("Vary") || "";
  const parts = existing.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === "accept")) parts.push("Accept");
  headers.set("Vary", parts.join(", "));
}

/** Markdown negotiation + HTML advertisement. env.ASSETS is the static-assets binding. */
export async function handle(request, env) {
  const method = request.method;
  const accept = request.headers.get("Accept") || "";
  const mdUrl = mdUrlFor(request.url);

  if (env.SITE_ENV === "staging" && new URL(request.url).pathname === "/robots.txt") {
    return new Response(method === "HEAD" ? null : STAGING_ROBOTS, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // (a) Strict negotiation: only GET/HEAD, only when Markdown is preferred.
  if (mdUrl && (method === "GET" || method === "HEAD") && prefersMarkdown(accept)) {
    try {
      const asset = await env.ASSETS.fetch(new Request(mdUrl, { method: "GET" }));
      if (asset.status === 200) {
        const markdown = await asset.text();
        // Preserve cache-relevant headers (ETag/Cache-Control) from the asset.
        const headers = new Headers(asset.headers);
        headers.set("Content-Type", "text/markdown; charset=utf-8");
        headers.set("Content-Length", String(new TextEncoder().encode(markdown).length));
        headers.set("X-Markdown-Tokens", String(estimateTokens(markdown)));
        for (const [k, v] of Object.entries(MD_SIGNALS)) headers.set(k, v);
        addVaryAccept(headers);
        // HEAD must not carry a body; Content-Length above reflects GET length.
        return new Response(method === "HEAD" ? null : markdown, { status: 200, headers });
      }
    } catch {
      // ASSETS error -> fail open to the HTML response below.
    }
  }

  // (b) Advertise on 200 text/html documents.
  const response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get("Content-Type") || "";
  if (mdUrl && response.status === 200 && contentType.startsWith("text/html")) {
    const headers = new Headers(response.headers);
    headers.append("Link", `<${mdUrl}>; rel="alternate"; type="text/markdown"`);
    addVaryAccept(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}

/** (c) Staging: mark every response noindex so staging.* never enters a search index. */
function applyStaging(response, env) {
  if (env.SITE_ENV !== "staging") return response;
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    return applyStaging(await handle(request, env), env);
  },
};
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, 2 files, 39 tests.

- [ ] **Step 5: Prove the fallback and staging tests can fail**

(a) Replace `    } catch {` with `    } catch (e) { throw e;` in `worker/index.js`, then run `npx vitest run test/worker.test.js`.
Expected: exactly 1 failure, `falls back to HTML when the assets binding throws for the markdown fetch`.
(b) Restore the file. Replace `if (env.SITE_ENV !== "staging") return response;` with `return response;`, then run the tests again.
Expected: 3 failures, all under `staging`.
Then restore the file and confirm `npx vitest run` shows 39 passing.

- [ ] **Step 6: Commit**

```powershell
git add worker/index.js test/worker.test.js
git commit -m "feat: add canonical site Worker"
```

### Task 3: Offline checks

**Files:**
- Create: `checks/lib/build.mjs`, `checks/offline.mjs`, `test/offline.test.js`

**Interfaces:**
- Produces: `fail(check, file, message) -> {check, file, message}`; `readText(dir, rel) -> string|null`; `isOwnHost(url, host) -> boolean`; `resolveUrlPath(dir, pathname) -> string|null`.
- Produces: `OFFLINE_CHECKS`, a map of name to `({dir, host}) -> failure[]` for `headers`, `llms`, `robots`, `sitemap`, `webmanifest`, `agent-card` and `md-siblings`.

- [ ] **Step 1: Write the failing test**

`test/offline.test.js`:

````js
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { OFFLINE_CHECKS } from "../checks/offline.mjs";
import { resolveUrlPath } from "../checks/lib/build.mjs";

const HOST = "example.test";

/** A minimal build that passes every offline check (shaped like W3BBK.us). */
const GOOD = {
  "index.html": "<!doctype html><title>Home</title>",
  "index.md": "# Home\n",
  "about/index.html": "<!doctype html><title>About</title>",
  "about/index.md": "# About\n",
  "404.html": "<!doctype html><title>404</title>",
  "_headers": [
    "/*",
    "  X-Content-Type-Options: nosniff",
    `  Link: <https://${HOST}/sitemap.xml>; rel="sitemap", <https://${HOST}/llms.txt>; rel="describedby"`,
    "",
  ].join("\n"),
  "llms.txt": [
    "# Example",
    "",
    "> Summary.",
    "",
    `- [Overview](https://${HOST}/index.md): the home page`,
    "- [About](/about/): relative link",
    "- [Elsewhere](https://other.test/): external, not checked offline",
    "",
    "```",
    `curl -H "Accept: text/markdown" https://${HOST}/nope/`,
    "```",
    "",
  ].join("\n"),
  "robots.txt": `User-agent: *\nAllow: /\n# comment\nContent-Signal: ai-train=no\n\nSitemap: https://${HOST}/sitemap.xml\n`,
  "sitemap.xml": [
    '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    `  <url><loc>https://${HOST}/</loc><lastmod>2026-09-01T10:00:00-04:00</lastmod><changefreq>yearly</changefreq><priority>1</priority></url>`,
    `  <url><loc>https://${HOST}/about/</loc></url>`,
    "</urlset>",
  ].join("\n"),
  "site.webmanifest": JSON.stringify({ name: "Example", icons: [{ src: "/icon-192.png", sizes: "192x192" }] }),
  "icon-192.png": "png",
  ".well-known/agent-card.json": JSON.stringify({
    name: "Example",
    description: "d",
    url: `https://${HOST}`,
    version: "1.0",
    protocolVersion: "0.3",
    capabilities: { streaming: false },
    skills: [],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/markdown"],
  }),
};

const dirs = [];
function site(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sp-offline-"));
  dirs.push(dir);
  for (const [rel, body] of Object.entries({ ...GOOD, ...overrides })) {
    if (body === null) continue; // null deletes a GOOD file
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const run = (name, dir) => OFFLINE_CHECKS[name]({ dir, host: HOST });

describe("the GOOD fixture", () => {
  it.each(Object.keys(OFFLINE_CHECKS))("passes %s", async (name) => {
    expect(await run(name, site())).toEqual([]);
  });
});

describe("resolveUrlPath", () => {
  it("maps directory URLs to index.html and refuses to escape the build dir", () => {
    const dir = site();
    expect(resolveUrlPath(dir, "/about/")).toMatch(/index\.html$/);
    expect(resolveUrlPath(dir, "/about")).toMatch(/index\.html$/);
    expect(resolveUrlPath(dir, "/missing/")).toBeNull();
    expect(resolveUrlPath(dir, "/../../etc/passwd")).toBeNull();
    expect(resolveUrlPath(dir, "/%E0%A4%A")).toBeNull();
  });
});

describe("headers", () => {
  it("flags a Link header pointing at another site (the kingfamily.info bug)", async () => {
    const dir = site({ _headers: "/*\n  Link: <https://kingfamily.info/sitemap.xml>; rel=\"sitemap\"\n" });
    expect(await run("headers", dir)).toEqual([
      { check: "headers", file: "_headers:2", message: `Link points at kingfamily.info, expected ${HOST}` },
    ]);
  });
});

describe("llms", () => {
  it("flags a missing file", async () => {
    expect((await run("llms", site({ "llms.txt": null })))[0].message).toBe("missing");
  });
  it("flags a missing H1", async () => {
    expect((await run("llms", site({ "llms.txt": "Example\n" })))[0].message).toMatch(/H1/);
  });
  it("flags a same-host link with no built file", async () => {
    const dir = site({ "llms.txt": `# X\n- [Gone](https://${HOST}/gone/)\n` });
    expect(await run("llms", dir)).toEqual([
      { check: "llms", file: "llms.txt", message: `link https://${HOST}/gone/ has no file in the build` },
    ]);
  });
});

describe("robots", () => {
  it("flags a Sitemap on another host", async () => {
    const dir = site({ "robots.txt": "User-agent: *\nSitemap: https://other.test/sitemap.xml\n" });
    expect(await run("robots", dir)).toEqual([
      { check: "robots", file: "robots.txt:2", message: `Sitemap https://other.test/sitemap.xml is not on ${HOST}` },
    ]);
  });
  it("flags a garbage line and a missing Sitemap", async () => {
    const found = await run("robots", site({ "robots.txt": "User-agent *\n" }));
    expect(found.map((f) => f.file)).toEqual(["robots.txt:1", "robots.txt"]);
  });
});

describe("sitemap", () => {
  it("flags a leading newline before the XML declaration", async () => {
    const found = await run("sitemap", site({ "sitemap.xml": `\n${GOOD["sitemap.xml"]}` }));
    expect(found.map((f) => f.message)).toContainEqual(expect.stringMatching(/must begin with the XML declaration/));
  });
  it("flags malformed XML", async () => {
    const found = await run("sitemap", site({ "sitemap.xml": '<?xml version="1.0"?><urlset><url></urlset>' }));
    expect(found[0].message).toMatch(/not well-formed/);
  });
  it("flags a <loc> on another host, a <loc> with no build file, and bad fields", async () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "<url><loc>https://other.test/</loc></url>",
      `<url><loc>https://${HOST}/gone/</loc><changefreq>sometimes</changefreq><priority>2</priority><lastmod>last week</lastmod></url>`,
      "</urlset>",
    ].join("");
    const found = await run("sitemap", site({ "sitemap.xml": xml }));
    expect(found.map((f) => `${f.file}: ${f.message}`)).toEqual([
      `sitemap.xml <url> #1: <loc> https://other.test/ is not on ${HOST}`,
      `sitemap.xml <url> #2: <loc> https://${HOST}/gone/ has no file in the build`,
      "sitemap.xml <url> #2: invalid <changefreq> sometimes",
      "sitemap.xml <url> #2: <priority> 2 not in 0.0-1.0",
      "sitemap.xml <url> #2: <lastmod> last week is not a W3C datetime",
    ]);
  });
  it("flags the wrong namespace", async () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://example.com/ns"><url><loc>https://${HOST}/</loc></url></urlset>`;
    expect((await run("sitemap", site({ "sitemap.xml": xml })))[0].message).toMatch(/xmlns/);
  });
});

describe("webmanifest", () => {
  it("flags an icon that is not in the build", async () => {
    const dir = site({ "site.webmanifest": JSON.stringify({ name: "X", icons: [{ src: "/missing.png" }] }) });
    expect(await run("webmanifest", dir)).toEqual([
      { check: "webmanifest", file: "site.webmanifest", message: "icon /missing.png has no file in the build" },
    ]);
  });
  it("flags invalid JSON", async () => {
    expect((await run("webmanifest", site({ "site.webmanifest": "{" })))[0].message).toMatch(/invalid JSON/);
  });
});

describe("agent-card", () => {
  it("flags missing required fields and a foreign url", async () => {
    const dir = site({ ".well-known/agent-card.json": JSON.stringify({ name: "X", url: "https://other.test", skills: {} }) });
    const messages = (await run("agent-card", dir)).map((f) => f.message);
    expect(messages).toEqual([
      '"protocolVersion" must be a non-empty string',
      '"description" must be a non-empty string',
      '"version" must be a non-empty string',
      `"url" https://other.test is not on ${HOST}`,
      '"capabilities" must be an object',
      '"skills" must be an array',
      '"defaultInputModes" must be a non-empty array of media types',
      '"defaultOutputModes" must be a non-empty array of media types',
    ]);
  });
  it("is skipped when the site has no agent card", async () => {
    expect(await run("agent-card", site({ ".well-known/agent-card.json": null }))).toEqual([]);
  });
});

describe("md-siblings", () => {
  it("flags an HTML page with no markdown sibling", async () => {
    expect(await run("md-siblings", site({ "about/index.md": null }))).toEqual([
      { check: "md-siblings", file: "about/index.html", message: "no about/index.md - the Worker advertises it on this page" },
    ]);
  });
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/offline.test.js`
Expected: FAIL, with an error that `../checks/offline.mjs` cannot be found.

- [ ] **Step 3: Write the helpers**

`checks/lib/build.mjs`:

````js
// Helpers shared by every check: failure records and build-output path resolution.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/** One check failure. `file` names the offending file (and line/entry when known). */
export function fail(check, file, message) {
  return { check, file, message };
}

/** Read a file under the build dir as UTF-8, or null when it does not exist. */
export function readText(dir, rel) {
  const path = join(dir, rel);
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : null;
}

/** True when `url` is absolute and its hostname is exactly `host`. */
export function isOwnHost(url, host) {
  try {
    return new URL(url).hostname === host;
  } catch {
    return false;
  }
}

/**
 * Map a URL pathname to the built file that would serve it, or null.
 * "/a/" -> a/index.html; "/a" -> a, else a/index.html. Never escapes `dir`.
 */
export function resolveUrlPath(dir, pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const root = resolve(dir);
  const candidates = path.endsWith("/") ? [`${path}index.html`] : [path, `${path}/index.html`];
  for (const candidate of candidates) {
    const abs = resolve(root, `.${candidate}`);
    if (abs !== root && !abs.startsWith(root + sep)) continue;
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }
  return null;
}
````

- [ ] **Step 4: Write the checks**

`checks/offline.mjs`:

````js
// Offline checks: run against the built public/ directory, no network.
// Each check takes { dir, host } and returns an array of failures (empty = pass).
import { readdirSync } from "node:fs";
import { posix } from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { fail, isOwnHost, readText, resolveUrlPath } from "./lib/build.mjs";

/** _headers: every absolute URL in a Link header points at this site. */
export function checkHeaders({ dir, host }) {
  const text = readText(dir, "_headers");
  if (text === null) return [];
  const failures = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\s+Link:\s*(.+)$/i);
    if (!m) return;
    for (const [, url] of m[1].matchAll(/<([^>]+)>/g)) {
      if (/^https?:\/\//i.test(url) && !isOwnHost(url, host)) {
        failures.push(fail("headers", `_headers:${i + 1}`, `Link points at ${new URL(url).hostname}, expected ${host}`));
      }
    }
  });
  return failures;
}

/** llms.txt: exists, opens with an H1, and every same-host link has a built file. */
export function checkLlms({ dir, host }) {
  const text = readText(dir, "llms.txt");
  if (text === null) return [fail("llms", "llms.txt", "missing")];
  const failures = [];
  const first = text.split(/\r?\n/).find((l) => l.trim() !== "");
  if (!first || !/^# \S/.test(first)) {
    failures.push(fail("llms", "llms.txt", "first line must be an H1 (\"# Title\")"));
  }
  const prose = text.replace(/^```[\s\S]*?^```/gm, "");
  for (const [, href] of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const url = new URL(href, `https://${host}/`);
    if (url.hostname !== host) continue; // external links belong to the weekly link check
    if (!resolveUrlPath(dir, url.pathname)) {
      failures.push(fail("llms", "llms.txt", `link ${href} has no file in the build`));
    }
  }
  return failures;
}

/** robots.txt: every line is "Field: value", and Sitemap lines point at this site's built sitemap. */
export function checkRobots({ dir, host }) {
  const text = readText(dir, "robots.txt");
  if (text === null) return [fail("robots", "robots.txt", "missing")];
  const failures = [];
  let sitemaps = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) return;
    const where = `robots.txt:${i + 1}`;
    const m = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/);
    if (!m) {
      failures.push(fail("robots", where, `not a "Field: value" line: ${raw}`));
      return;
    }
    if (m[1].toLowerCase() !== "sitemap") return;
    sitemaps++;
    if (!isOwnHost(m[2], host)) {
      failures.push(fail("robots", where, `Sitemap ${m[2]} is not on ${host}`));
    } else if (!resolveUrlPath(dir, new URL(m[2]).pathname)) {
      failures.push(fail("robots", where, `Sitemap ${m[2]} has no file in the build`));
    }
  });
  if (sitemaps === 0) failures.push(fail("robots", "robots.txt", "no Sitemap: line"));
  return failures;
}

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const CHANGEFREQ = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
const W3C_DATETIME = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;

/**
 * sitemap.xml: well-formed, sitemaps.org 0.9 structure, every <loc> on this host and built.
 * minimal: hand-rolled rules mirroring the sitemaps.org XSD instead of an XSD validator
 * (needs xmllint + a vendored schema); upgrade path is xmllint --schema in CI.
 */
export function checkSitemap({ dir, host }) {
  const text = readText(dir, "sitemap.xml");
  if (text === null) return [fail("sitemap", "sitemap.xml", "missing")];
  const failures = [];
  if (!text.startsWith("<?xml")) {
    failures.push(fail("sitemap", "sitemap.xml", "must begin with the XML declaration \"<?xml\" (no leading whitespace or BOM)"));
  }
  const valid = XMLValidator.validate(text.trimStart());
  if (valid !== true) {
    failures.push(fail("sitemap", "sitemap.xml", `not well-formed XML: ${valid.err.msg} (line ${valid.err.line})`));
    return failures;
  }
  const doc = new XMLParser({ ignoreAttributes: false, parseTagValue: false, isArray: (name) => name === "url" }).parse(text.trimStart());
  const urlset = doc.urlset;
  if (!urlset) return [...failures, fail("sitemap", "sitemap.xml", "root element must be <urlset>")];
  if (urlset["@_xmlns"] !== SITEMAP_NS) {
    failures.push(fail("sitemap", "sitemap.xml", `<urlset> xmlns must be ${SITEMAP_NS}`));
  }
  const urls = urlset.url || [];
  if (urls.length === 0) failures.push(fail("sitemap", "sitemap.xml", "no <url> entries"));
  urls.forEach((u, i) => {
    const where = `sitemap.xml <url> #${i + 1}`;
    if (typeof u.loc !== "string" || u.loc === "") {
      failures.push(fail("sitemap", where, "missing <loc>"));
      return;
    }
    if (u.loc.length > 2048) failures.push(fail("sitemap", where, "<loc> longer than 2048 characters"));
    if (!isOwnHost(u.loc, host)) {
      failures.push(fail("sitemap", where, `<loc> ${u.loc} is not on ${host}`));
    } else if (!resolveUrlPath(dir, new URL(u.loc).pathname)) {
      failures.push(fail("sitemap", where, `<loc> ${u.loc} has no file in the build`));
    }
    if (u.changefreq !== undefined && !CHANGEFREQ.has(u.changefreq)) {
      failures.push(fail("sitemap", where, `invalid <changefreq> ${u.changefreq}`));
    }
    if (u.priority !== undefined) {
      const p = Number(u.priority);
      if (!(u.priority !== "" && p >= 0 && p <= 1)) failures.push(fail("sitemap", where, `<priority> ${u.priority} not in 0.0-1.0`));
    }
    if (u.lastmod !== undefined && !W3C_DATETIME.test(u.lastmod)) {
      failures.push(fail("sitemap", where, `<lastmod> ${u.lastmod} is not a W3C datetime`));
    }
  });
  return failures;
}

/** site.webmanifest: valid JSON with a name, and every icon exists in the build. Optional file. */
export function checkWebmanifest({ dir }) {
  const name = ["site.webmanifest", "manifest.webmanifest"].find((n) => readText(dir, n) !== null);
  if (!name) return [];
  let manifest;
  try {
    manifest = JSON.parse(readText(dir, name));
  } catch (e) {
    return [fail("webmanifest", name, `invalid JSON: ${e.message}`)];
  }
  const failures = [];
  if (!manifest.name && !manifest.short_name) failures.push(fail("webmanifest", name, "needs name or short_name"));
  for (const icon of manifest.icons || []) {
    if (typeof icon.src !== "string" || icon.src === "") {
      failures.push(fail("webmanifest", name, "icon without src"));
      continue;
    }
    const path = new URL(icon.src, "https://manifest.invalid/").pathname;
    if (!resolveUrlPath(dir, path)) failures.push(fail("webmanifest", name, `icon ${icon.src} has no file in the build`));
  }
  return failures;
}

/**
 * .well-known/agent-card.json: A2A AgentCard required fields. Optional file.
 * minimal: required-field rules instead of the full A2A JSON Schema; upgrade path is
 * vendoring the schema and validating with ajv.
 */
export function checkAgentCard({ dir, host }) {
  const rel = ".well-known/agent-card.json";
  const text = readText(dir, rel);
  if (text === null) return [];
  let card;
  try {
    card = JSON.parse(text);
  } catch (e) {
    return [fail("agent-card", rel, `invalid JSON: ${e.message}`)];
  }
  const failures = [];
  for (const key of ["protocolVersion", "name", "description", "url", "version"]) {
    if (typeof card[key] !== "string" || card[key] === "") {
      failures.push(fail("agent-card", rel, `"${key}" must be a non-empty string`));
    }
  }
  if (typeof card.url === "string" && card.url !== "" && !isOwnHost(card.url, host)) {
    failures.push(fail("agent-card", rel, `"url" ${card.url} is not on ${host}`));
  }
  if (!card.capabilities || typeof card.capabilities !== "object" || Array.isArray(card.capabilities)) {
    failures.push(fail("agent-card", rel, "\"capabilities\" must be an object"));
  }
  if (!Array.isArray(card.skills)) failures.push(fail("agent-card", rel, "\"skills\" must be an array"));
  for (const key of ["defaultInputModes", "defaultOutputModes"]) {
    const v = card[key];
    if (!Array.isArray(v) || v.length === 0 || !v.every((s) => typeof s === "string")) {
      failures.push(fail("agent-card", rel, `"${key}" must be a non-empty array of media types`));
    }
  }
  return failures;
}

/** Every built HTML page (…/index.html) has the index.md sibling the Worker will advertise. */
export function checkMdSiblings({ dir }) {
  const failures = [];
  for (const rel of readdirSync(dir, { recursive: true })) {
    const path = String(rel).split("\\").join("/");
    if (path.split("/").pop() !== "index.html") continue;
    const md = posix.join(posix.dirname(path), "index.md");
    if (readText(dir, md) === null) {
      failures.push(fail("md-siblings", path, `no ${md} - the Worker advertises it on this page`));
    }
  }
  return failures;
}

export const OFFLINE_CHECKS = {
  headers: checkHeaders,
  llms: checkLlms,
  robots: checkRobots,
  sitemap: checkSitemap,
  webmanifest: checkWebmanifest,
  "agent-card": checkAgentCard,
  "md-siblings": checkMdSiblings,
};
````

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, 3 files, 62 tests.

- [ ] **Step 6: Commit**

```powershell
git add checks/lib/build.mjs checks/offline.mjs test/offline.test.js
git commit -m "feat: add offline build checks"
```

### Task 4: Live checks

**Files:**
- Create: `checks/live.mjs`, `test/live.test.js`

**Interfaces:**
- Consumes: Task 2's Worker (the test runs it in front of a stub), and Task 3's `fail`.
- Produces: `BROWSER_UA`, `BROWSER_ACCEPT`; `checkNegotiationLive(base, {fetchImpl, headers}) -> failure[]`; `checkSmoke(base, {pages, staging, fetchImpl, headers}) -> failure[]`; `parseSecurityTxt(text) -> Map`; `evaluateSecurityTxt(text, host, {now, warnDays}) -> failure[]`; `checkSecurityTxt(host, {fetchImpl, now}) -> failure[]`.

- [ ] **Step 1: Write the failing test**

`test/live.test.js`:

````js
import { describe, it, expect } from "vitest";
import worker from "../worker/index.js";
import { BROWSER_UA, checkNegotiationLive, checkSmoke, checkSecurityTxt, evaluateSecurityTxt } from "../checks/live.mjs";

// A fake deployed site: the real Worker in front of a stub assets binding.
const FILES = {
  "/index.html": ["<!doctype html>", "text/html; charset=utf-8"],
  "/index.md": ["# Home\n", "text/markdown; charset=utf-8"],
  "/about/index.html": ["<!doctype html>", "text/html; charset=utf-8"],
  "/robots.txt": ["User-agent: *\nAllow: /\n", "text/plain"],
};
const ASSETS = {
  async fetch(input) {
    const req = input instanceof Request ? input : new Request(input);
    const { pathname } = new URL(req.url);
    const file = FILES[pathname.endsWith("/") ? `${pathname}index.html` : pathname];
    if (!file) return new Response("nf", { status: 404, headers: { "Content-Type": "text/html" } });
    return new Response(req.method === "HEAD" ? null : file[0], { headers: { "Content-Type": file[1] } });
  },
};
const deployed = (env = {}, seen = []) => async (url, init) => {
  seen.push(init.headers);
  return worker.fetch(new Request(url, init), { ASSETS, ...env });
};
// A deployment without the Worker in front: plain assets, no negotiation.
const assetsOnly = async (url, init) => ASSETS.fetch(new Request(url, init));

describe("checkNegotiationLive", () => {
  it("passes against the real Worker", async () => {
    expect(await checkNegotiationLive("https://site.test", { fetchImpl: deployed() })).toEqual([]);
  });

  it("fails against an assets-only deployment (today's BBKing/W3BBK)", async () => {
    const messages = (await checkNegotiationLive("https://site.test", { fetchImpl: assetsOnly })).map((f) => f.message);
    expect(messages).toEqual([
      'Accept: text/markdown got Content-Type "text/html; charset=utf-8"',
      "markdown response has no X-Markdown-Tokens",
      "markdown response Vary lacks Accept",
      "HTML response has no markdown alternate Link",
      "HTML response Vary lacks Accept",
      'HEAD with Accept: text/markdown returned 200 "text/html; charset=utf-8"',
    ]);
  });

  it("sends a browser user agent and passes extra headers (Access token)", async () => {
    const seen = [];
    await checkNegotiationLive("https://site.test", { fetchImpl: deployed({}, seen), headers: { "CF-Access-Client-Id": "id" } });
    expect(seen.every((h) => h["User-Agent"] === BROWSER_UA && h["CF-Access-Client-Id"] === "id")).toBe(true);
  });
});

describe("checkSmoke", () => {
  it("passes production and staging against the matching Worker env", async () => {
    expect(await checkSmoke("https://site.test", { pages: ["/", "/about/"], fetchImpl: deployed() })).toEqual([]);
    expect(await checkSmoke("https://site.test", { staging: true, fetchImpl: deployed({ SITE_ENV: "staging" }) })).toEqual([]);
  });

  it("fails production that is noindex (staging config leaked)", async () => {
    const found = await checkSmoke("https://site.test", { fetchImpl: deployed({ SITE_ENV: "staging" }) });
    expect(found[0].message).toBe('production response is noindex ("noindex, nofollow")');
  });

  it("fails staging that is indexable and serves the production robots.txt", async () => {
    const messages = (await checkSmoke("https://site.test", { staging: true, fetchImpl: deployed() })).map((f) => f.message);
    expect(messages).toEqual(["staging response is not X-Robots-Tag noindex", "staging robots.txt is not the disallow-all file"]);
  });

  it("fails a page that does not return 200", async () => {
    const found = await checkSmoke("https://site.test", { pages: ["/gone/"], fetchImpl: deployed() });
    expect(found[0]).toEqual({ check: "smoke", file: "https://site.test/gone/", message: "returned 404" });
  });
});

describe("security.txt", () => {
  const NOW = new Date("2026-09-23T00:00:00Z");
  const good = [
    "Canonical: https://w3bbk.us/.well-known/security.txt",
    "Contact: mailto:security@w3bbk.us",
    "Expires: 2029-12-31T23:59:00Z",
    "Preferred-Languages: en",
  ].join("\n");

  it("passes the file Cloudflare serves today", () => {
    expect(evaluateSecurityTxt(good, "w3bbk.us", { now: NOW })).toEqual([]);
  });
  it("warns 30 days before Expires", () => {
    const found = evaluateSecurityTxt(good, "w3bbk.us", { now: new Date("2029-12-10T00:00:00Z") });
    expect(found[0].message).toMatch(/^expires in 22 days/);
  });
  it("fails an expired file", () => {
    expect(evaluateSecurityTxt(good, "w3bbk.us", { now: new Date("2030-01-01T00:00:00Z") })[0].message).toMatch(/^expired on/);
  });
  it("fails a Contact on another domain and a mismatched Canonical", () => {
    const text = good.replace("security@w3bbk.us", "security@bbking.net").replace("w3bbk.us/.well", "bbking.net/.well");
    expect(evaluateSecurityTxt(text, "w3bbk.us", { now: NOW }).map((f) => f.message)).toEqual([
      "no Contact on w3bbk.us (mailto:security@bbking.net)",
      "Canonical https://bbking.net/.well-known/security.txt does not match https://w3bbk.us/.well-known/security.txt",
    ]);
  });
  it("fails a missing or duplicated Expires", () => {
    expect(evaluateSecurityTxt("Contact: mailto:security@w3bbk.us", "w3bbk.us", { now: NOW })[0].message).toBe("needs exactly one Expires field, found 0");
  });
  it("fails when the file is not served", async () => {
    const fetchImpl = async () => new Response("nf", { status: 404 });
    expect((await checkSecurityTxt("w3bbk.us", { fetchImpl }))[0].message).toBe("returned 404");
  });
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/live.test.js`
Expected: FAIL, with an error that `../checks/live.mjs` cannot be found.

- [ ] **Step 3: Write the implementation**

`checks/live.mjs`:

````js
// Live checks: run against a deployed URL (PR preview, staging, or production).
// Every function takes an injectable fetchImpl so tests never touch the network.
import { fail } from "./lib/build.mjs";

// The sites challenge curl's default user agent (403); identify as a browser plus the pipeline.
export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 site-pipeline";
export const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

const varyHasAccept = (res) =>
  (res.headers.get("vary") || "").split(",").some((v) => v.trim().toLowerCase() === "accept");

function request(fetchImpl, url, { method = "GET", accept = BROWSER_ACCEPT, headers = {} } = {}) {
  return fetchImpl(url, {
    method,
    redirect: "manual",
    headers: { "User-Agent": BROWSER_UA, Accept: accept, ...headers },
  });
}

/** Markdown negotiation on "/": markdown for Accept: text/markdown, HTML + Link for browsers, HEAD. */
export async function checkNegotiationLive(base, { fetchImpl = fetch, headers = {} } = {}) {
  const url = new URL("/", base).toString();
  const failures = [];
  const md = await request(fetchImpl, url, { accept: "text/markdown", headers });
  if (md.status !== 200) {
    failures.push(fail("negotiate-live", url, `Accept: text/markdown returned ${md.status}`));
  } else {
    const type = md.headers.get("content-type") || "";
    if (!type.startsWith("text/markdown")) failures.push(fail("negotiate-live", url, `Accept: text/markdown got Content-Type "${type}"`));
    if (!/^\d+$/.test(md.headers.get("x-markdown-tokens") || "")) failures.push(fail("negotiate-live", url, "markdown response has no X-Markdown-Tokens"));
    if (!varyHasAccept(md)) failures.push(fail("negotiate-live", url, "markdown response Vary lacks Accept"));
  }
  const html = await request(fetchImpl, url, { headers });
  const htmlType = html.headers.get("content-type") || "";
  if (html.status !== 200 || !htmlType.startsWith("text/html")) {
    failures.push(fail("negotiate-live", url, `browser request returned ${html.status} "${htmlType}"`));
  } else {
    const link = html.headers.get("link") || "";
    if (!/rel="alternate";\s*type="text\/markdown"/.test(link)) failures.push(fail("negotiate-live", url, "HTML response has no markdown alternate Link"));
    if (!varyHasAccept(html)) failures.push(fail("negotiate-live", url, "HTML response Vary lacks Accept"));
  }
  const head = await request(fetchImpl, url, { method: "HEAD", accept: "text/markdown", headers });
  if (head.status !== 200 || !(head.headers.get("content-type") || "").startsWith("text/markdown")) {
    failures.push(fail("negotiate-live", url, `HEAD with Accept: text/markdown returned ${head.status} "${head.headers.get("content-type")}"`));
  } else if ((await head.text()) !== "") {
    failures.push(fail("negotiate-live", url, "HEAD response carried a body"));
  }
  return failures;
}

/**
 * Post-deploy smoke: pages return 200, robots behaviour matches the environment, negotiation works.
 * Production must NOT be noindex - that guards against staging config leaking into production.
 */
export async function checkSmoke(base, { pages = ["/"], staging = false, fetchImpl = fetch, headers = {} } = {}) {
  const failures = [];
  for (const page of pages) {
    const url = new URL(page, base).toString();
    const res = await request(fetchImpl, url, { headers });
    if (res.status !== 200) {
      failures.push(fail("smoke", url, `returned ${res.status}`));
      continue;
    }
    const robotsTag = (res.headers.get("x-robots-tag") || "").toLowerCase();
    if (staging && !robotsTag.includes("noindex")) failures.push(fail("smoke", url, "staging response is not X-Robots-Tag noindex"));
    if (!staging && robotsTag.includes("noindex")) failures.push(fail("smoke", url, `production response is noindex ("${robotsTag}")`));
  }
  const robotsUrl = new URL("/robots.txt", base).toString();
  const robots = await request(fetchImpl, robotsUrl, { accept: "text/plain", headers });
  if (robots.status !== 200) {
    failures.push(fail("smoke", robotsUrl, `returned ${robots.status}`));
  } else if (staging && (await robots.text()) !== "User-agent: *\nDisallow: /\n") {
    failures.push(fail("smoke", robotsUrl, "staging robots.txt is not the disallow-all file"));
  }
  failures.push(...(await checkNegotiationLive(base, { fetchImpl, headers })));
  return failures;
}

/** Parse security.txt into lowercase field -> [values]. Comments and blank lines are ignored. */
export function parseSecurityTxt(text) {
  const fields = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    fields.set(key, [...(fields.get(key) || []), m[2].trim()]);
  }
  return fields;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** RFC 9116 essentials: a Contact on this domain, exactly one future Expires, Canonical if present. */
export function evaluateSecurityTxt(text, host, { now = new Date(), warnDays = 30 } = {}) {
  const where = `https://${host}/.well-known/security.txt`;
  const fields = parseSecurityTxt(text);
  const failures = [];
  const contacts = fields.get("contact") || [];
  const own = contacts.some((c) => {
    if (c.toLowerCase().startsWith("mailto:")) return c.slice(7).split("@").pop().toLowerCase() === host;
    try {
      return new URL(c).hostname === host;
    } catch {
      return false;
    }
  });
  if (contacts.length === 0) failures.push(fail("security-txt", where, "no Contact field"));
  else if (!own) failures.push(fail("security-txt", where, `no Contact on ${host} (${contacts.join(", ")})`));
  const expires = fields.get("expires") || [];
  if (expires.length !== 1) {
    failures.push(fail("security-txt", where, `needs exactly one Expires field, found ${expires.length}`));
  } else {
    const at = new Date(expires[0]);
    if (Number.isNaN(at.getTime())) failures.push(fail("security-txt", where, `Expires "${expires[0]}" is not a date`));
    else if (at <= now) failures.push(fail("security-txt", where, `expired on ${expires[0]}`));
    else if (at - now < warnDays * DAY_MS) {
      failures.push(fail("security-txt", where, `expires in ${Math.ceil((at - now) / DAY_MS)} days (${expires[0]}) - update it in Cloudflare Security Center`));
    }
  }
  for (const c of fields.get("canonical") || []) {
    if (c !== where) failures.push(fail("security-txt", where, `Canonical ${c} does not match ${where}`));
  }
  return failures;
}

/** Fetch and evaluate the served security.txt. */
export async function checkSecurityTxt(host, { fetchImpl = fetch, now = new Date() } = {}) {
  const url = `https://${host}/.well-known/security.txt`;
  const res = await request(fetchImpl, url, { accept: "text/plain" });
  if (res.status !== 200) return [fail("security-txt", url, `returned ${res.status}`)];
  return evaluateSecurityTxt(await res.text(), host, { now });
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, 4 files, 75 tests.

- [ ] **Step 5: Commit**

```powershell
git add checks/live.mjs test/live.test.js
git commit -m "feat: add live negotiation and smoke checks"
```

### Task 5: Gate logic and wrangler parsing

**Files:**
- Create: `checks/visual.mjs`, `checks/lighthouse.mjs`, `checks/lib/ci.mjs`, `test/gates.test.js`

**Interfaces:**
- Produces (`visual.mjs`): `VIEWPORTS`, `MAX_DIFF_RATIO = 0.001`, `BLOCKED_HOSTS`, `comparePngs(a, b) -> {ratio, diff, reason}`, `capture(browser, url, viewport, mask) -> Buffer`, `evaluateVisual(results, {approved}) -> {status, failures}`.
- Produces (`lighthouse.mjs`): `CATEGORIES`, `MIN_SCORE = 95`, `MAX_PERF_DROP = 10`, `median`, `medianScores(runs)`, `evaluateLighthouse(pages) -> failure[]`, `runLighthouse(url, {runs}) -> scores`.
- Produces (`ci.mjs`): `parseVersionUpload(text) -> {versionId, previewUrl, aliasUrl}`, `parseActiveVersion(text) -> id`, `versionPreviewUrl(anyPreviewUrl, worker, versionId) -> url`, `issueAction(openIssueNumber, failing) -> "create"|"comment"|"close"|"none"`, `SUMMARY_MARKER`, `renderSummary(sections) -> markdown`.

- [ ] **Step 1: Write the failing test**

`test/gates.test.js`:

````js
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
````

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/gates.test.js`
Expected: FAIL, with an error that `../checks/visual.mjs` cannot be found.

- [ ] **Step 3: Write the three modules**

`checks/visual.mjs`:

````js
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
````

`checks/lighthouse.mjs`:

````js
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
````

`checks/lib/ci.mjs`:

````js
// Pure helpers for the workflows: wrangler output parsing, pin consistency, issues, PR summary.

/** Parse `wrangler versions upload` output. */
export function parseVersionUpload(output) {
  const versionId = output.match(/Worker Version ID:\s*([0-9a-f-]{36})/i)?.[1];
  const previewUrl = output.match(/Version Preview URL:\s*(https:\/\/\S+)/i)?.[1];
  const aliasUrl = output.match(/Version Preview Alias URL:\s*(https:\/\/\S+)/i)?.[1];
  if (!versionId) throw new Error("no 'Worker Version ID' in wrangler versions upload output");
  return { versionId, previewUrl: previewUrl ?? null, aliasUrl: aliasUrl ?? null };
}

/** Version ID serving 100 % of traffic, from `wrangler deployments status` output. */
export function parseActiveVersion(output) {
  const ids = [...output.matchAll(/\((\d+)%\)\s+([0-9a-f-]{36})/g)];
  const full = ids.find(([, pct]) => pct === "100");
  if (!full) throw new Error(`no single version at 100% (found ${ids.map(([, p, id]) => `${id}@${p}%`).join(", ") || "none"})`);
  return full[2];
}

/** Preview URL of `versionId`, using the account subdomain seen in any preview URL of `worker`. */
export function versionPreviewUrl(anyPreviewUrl, worker, versionId) {
  const escaped = worker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = anyPreviewUrl.match(new RegExp(`^https://[a-z0-9-]+-${escaped}\\.([a-z0-9-]+)\\.workers\\.dev/?$`, "i"));
  if (!m) throw new Error(`cannot read the workers.dev subdomain from ${anyPreviewUrl} for worker ${worker}`);
  return `https://${versionId.slice(0, 8)}-${worker}.${m[1]}.workers.dev`;
}

/** What to do with the one tracking issue for a scheduled check. */
export function issueAction(openIssueNumber, failing) {
  if (failing) return openIssueNumber ? "comment" : "create";
  return openIssueNumber ? "close" : "none";
}

const ICON = { pass: "✅", fail: "❌", approved: "🟡", skip: "⏭️" };
export const SUMMARY_MARKER = "<!-- site-gate -->";

/** Markdown PR comment. sections: [{ name, status, failures: [{ file, message }], notes?: string[] }]. */
export function renderSummary(sections, { title = "site-gate" } = {}) {
  const red = sections.some((s) => s.status === "fail");
  const lines = [SUMMARY_MARKER, `## ${red ? ICON.fail : ICON.pass} ${title}`, "", "| Check | Result |", "|---|---|"];
  for (const s of sections) lines.push(`| ${s.name} | ${ICON[s.status] ?? "?"} ${s.status} |`);
  for (const s of sections) {
    if (!s.failures?.length && !s.notes?.length) continue;
    lines.push("", `### ${s.name}`);
    for (const n of s.notes || []) lines.push(`- ${n}`);
    for (const f of s.failures || []) lines.push(`- \`${f.file}\`: ${f.message}`);
  }
  return `${lines.join("\n")}\n`;
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, 5 files, 92 tests.

- [ ] **Step 5: Commit**

```powershell
git add checks/visual.mjs checks/lighthouse.mjs checks/lib/ci.mjs test/gates.test.js
git commit -m "feat: add visual, Lighthouse and CI gate logic"
```

### Task 6: CLI, composite action and workflows

**Files:**
- Create: `checks/cli.mjs`, `.github/actions/setup/action.yml`, `.github/workflows/site-pr.yml`, `.github/workflows/site-deploy.yml`, `.github/workflows/site-weekly.yml`, `.github/workflows/ci.yml`, `.github/workflows/toolchain-bump.yml`, `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: the CLI commands `offline`, `negotiate`, `smoke`, `security-txt`, `visual`, `lighthouse`, `preview-urls`, `active-version`, `version-info`, `issue` and `summary`. Each writes `--json` results as `[{name, status, failures}]` and exits 1 on failure (2 on bad arguments). The reusable workflows' `inputs` are listed in `README.md`.

- [ ] **Step 1: Write the CLI**

`checks/cli.mjs`:

````js
#!/usr/bin/env node
// Single entry point the workflows call:  node checks/cli.mjs <command> [--options]
// Every command prints a human report, optionally writes --json results, and exits 1 on failure.
import { parseArgs } from "node:util";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OFFLINE_CHECKS } from "./offline.mjs";
import { checkNegotiationLive, checkSecurityTxt, checkSmoke } from "./live.mjs";
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

const need = (...keys) => {
  const missing = keys.filter((k) => !opt[k]);
  if (missing.length) {
    console.error(`${command}: missing --${missing.join(", --")}`);
    process.exit(2);
  }
};

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
    need("host");
    report("security.txt", await checkSecurityTxt(opt.host));
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
    if (!upload.previewUrl) throw new Error("no 'Version Preview URL' in upload output - are preview_urls enabled?");
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
````

- [ ] **Step 2: Exercise the CLI against real builds**

```powershell
$tmp = Join-Path $env:TEMP "w3bbk-build"
Push-Location P:\Family_Websites\W3BBK.us; hugo --gc --minify -d $tmp --quiet; Pop-Location
node checks/cli.mjs offline --dir $tmp --host w3bbk.us; "exit=$LASTEXITCODE"
node checks/cli.mjs offline --dir P:\Family_Websites\JillK.ing\public --host jillk.ing > $null; "exit=$LASTEXITCODE"
node checks/cli.mjs security-txt --host w3bbk.us; "exit=$LASTEXITCODE"
node checks/cli.mjs smoke > $null 2>&1; "exit=$LASTEXITCODE"
```
Expected, in order:
- `PASS offline checks` then `exit=0`.
- `exit=1`, from JillK's `_headers` pointing at `kingfamily.info` (a known real defect).
- `PASS security.txt` then `exit=0`.
- `exit=2` (missing `--base`).

Run these one command per line, as shown. A trailing `| Select-Object` resets `$LASTEXITCODE`.

- [ ] **Step 3: Write the composite action**

`.github/actions/setup/action.yml`:

````yaml
name: site-pipeline setup
description: >
  Node, the pipeline's own dependencies, optionally Hugo + Dart Sass from toolchain.json, and the
  site's npm dependencies with @kingfamily/site-worker forced to the pinned pipeline ref.
  Expects the site checked out at the workspace root and site-pipeline at ./.site-pipeline.
inputs:
  ref:
    description: site-pipeline ref the site's workflows pin
    required: true
  toolchain:
    description: install Hugo extended and Dart Sass
    default: "false"
  browsers:
    description: install Playwright Chromium (visual regression)
    default: "false"
runs:
  using: composite
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: 24

    - name: Install pipeline dependencies
      shell: bash
      run: npm ci --prefix .site-pipeline

    - name: Install Hugo and Dart Sass
      if: inputs.toolchain == 'true'
      shell: bash
      run: |
        HUGO_VERSION=$(jq -r .hugo .site-pipeline/toolchain.json)
        DART_SASS_VERSION=$(jq -r .dartSass .site-pipeline/toolchain.json)
        mkdir -p "$RUNNER_TEMP/bin"
        curl -fsSL "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz" \
          | tar -xz -C "$RUNNER_TEMP/bin" hugo
        curl -fsSL "https://github.com/sass/dart-sass/releases/download/${DART_SASS_VERSION}/dart-sass-${DART_SASS_VERSION}-linux-x64.tar.gz" \
          | tar -xz -C "$RUNNER_TEMP"
        echo "$RUNNER_TEMP/bin" >> "$GITHUB_PATH"
        echo "$RUNNER_TEMP/dart-sass" >> "$GITHUB_PATH"

    - name: Install site dependencies at the pinned pipeline ref
      shell: bash
      env:
        REF: ${{ inputs.ref }}
      run: |
        if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; fi
        npm install --no-save "github:brianbking/site-pipeline#${REF}"

    - name: Install Playwright Chromium
      if: inputs.browsers == 'true'
      shell: bash
      run: npx --prefix .site-pipeline playwright install --with-deps chromium
````

- [ ] **Step 4: Write the reusable workflows**

`.github/workflows/site-pr.yml`:

````yaml
name: site-pr

# Reusable PR pipeline: build once -> offline checks -> preview upload -> live checks -> site-gate.
on:
  workflow_call:
    inputs:
      host:
        description: production hostname, e.g. w3bbk.us
        type: string
        required: true
      worker:
        description: production Worker name, e.g. w3bbk
        type: string
        required: true
      visual-pages:
        type: string
        default: '["/"]'
      visual-mask:
        description: JSON array of CSS selectors blanked before screenshots
        type: string
        default: "[]"
      lighthouse-pages:
        type: string
        default: '["/"]'
    secrets:
      CLOUDFLARE_API_TOKEN:
        required: true
      CLOUDFLARE_ACCOUNT_ID:
        required: true

permissions:
  contents: read

env:
  TZ: America/New_York
  HUGO_ENVIRONMENT: production

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      ref: ${{ steps.ref.outputs.ref }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Hugo .GitInfo / lastmod

      - name: Resolve pinned site-pipeline ref
        id: ref
        run: |
          refs=$(grep -rhoE 'brianbking/site-pipeline/\.github/workflows/[A-Za-z0-9._-]+@[A-Za-z0-9._/-]+' .github/workflows | sed 's/.*@//' | sort -u)
          if [ "$(printf '%s' "$refs" | grep -c .)" != "1" ]; then
            echo "::error::workflows must pin exactly one site-pipeline ref, found: ${refs:-none}"
            exit 1
          fi
          echo "ref=$refs" >> "$GITHUB_OUTPUT"

      - uses: actions/checkout@v4
        with:
          repository: brianbking/site-pipeline
          ref: ${{ steps.ref.outputs.ref }}
          path: .site-pipeline

      - uses: ./.site-pipeline/.github/actions/setup
        with:
          ref: ${{ steps.ref.outputs.ref }}
          toolchain: "true"

      - name: Build
        run: |
          git config core.quotepath false
          hugo --gc --minify

      - name: Offline checks
        continue-on-error: true # reported by site-gate; the preview still deploys so live checks run too
        env:
          HOST: ${{ inputs.host }}
        run: |
          mkdir -p results
          node .site-pipeline/checks/cli.mjs offline --dir public --host "$HOST" --json results/10-offline.json

      - uses: actions/upload-artifact@v4
        with:
          name: public
          path: public
          include-hidden-files: true # public/.well-known/
          retention-days: 7

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: results-build
          path: results
          if-no-files-found: ignore

  preview:
    needs: build
    runs-on: ubuntu-latest
    outputs:
      candidate: ${{ steps.urls.outputs.candidate }}
      baseline: ${{ steps.urls.outputs.baseline }}
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: brianbking/site-pipeline
          ref: ${{ needs.build.outputs.ref }}
          path: .site-pipeline
      - uses: ./.site-pipeline/.github/actions/setup
        with:
          ref: ${{ needs.build.outputs.ref }}
      - uses: actions/download-artifact@v4
        with:
          name: public
          path: public

      - name: Upload preview version
        env:
          PR: ${{ github.event.pull_request.number }}
          SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          npx wrangler versions upload --env= --preview-alias "pr-${PR}" --message "PR #${PR} ${SHA}" | tee upload.txt
          npx wrangler deployments status --env= | tee active.txt

      - name: Resolve preview URLs
        id: urls
        env:
          WORKER: ${{ inputs.worker }}
        run: node .site-pipeline/checks/cli.mjs preview-urls --file upload.txt --active-file active.txt --worker "$WORKER" | tee -a "$GITHUB_OUTPUT"

  live:
    needs: [build, preview]
    runs-on: ubuntu-latest
    env:
      CANDIDATE: ${{ needs.preview.outputs.candidate }}
      BASELINE: ${{ needs.preview.outputs.baseline }}
      VISUAL_PAGES: ${{ inputs.visual-pages }}
      VISUAL_MASK: ${{ inputs.visual-mask }}
      LIGHTHOUSE_PAGES: ${{ inputs.lighthouse-pages }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: brianbking/site-pipeline
          ref: ${{ needs.build.outputs.ref }}
          path: .site-pipeline
      - uses: ./.site-pipeline/.github/actions/setup
        with:
          ref: ${{ needs.build.outputs.ref }}
          browsers: "true"
      - run: mkdir -p results

      - name: Markdown negotiation
        continue-on-error: true
        run: node .site-pipeline/checks/cli.mjs negotiate --base "$CANDIDATE" --json results/20-negotiate.json

      - name: Visual regression
        continue-on-error: true
        env:
          APPROVED: ${{ contains(github.event.pull_request.labels.*.name, 'approved-visual-change') }}
        run: |
          node .site-pipeline/checks/cli.mjs visual --baseline "$BASELINE" --candidate "$CANDIDATE" \
            --pages "$VISUAL_PAGES" --mask "$VISUAL_MASK" --out visual \
            $([ "$APPROVED" = "true" ] && echo --approved) --json results/30-visual.json

      - name: Lighthouse
        continue-on-error: true
        run: |
          node .site-pipeline/checks/cli.mjs lighthouse --baseline "$BASELINE" --candidate "$CANDIDATE" \
            --pages "$LIGHTHOUSE_PAGES" --json results/40-lighthouse.json

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: results-live
          path: results
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: visual-diffs
          path: visual
          if-no-files-found: ignore
          retention-days: 14

  site-gate:
    needs: [build, preview, live]
    if: always()
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: results-*
          merge-multiple: true
          path: results
      - uses: actions/checkout@v4
        with:
          repository: brianbking/site-pipeline
          ref: ${{ needs.build.outputs.ref || 'main' }}
          path: .site-pipeline
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Summarize
        id: summary
        continue-on-error: true
        env:
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          CANDIDATE: ${{ needs.preview.outputs.candidate }}
          BUILD: ${{ needs.build.result }}
          PREVIEW: ${{ needs.preview.result }}
          LIVE: ${{ needs.live.result }}
        run: |
          mkdir -p results
          failed=""
          [ "$BUILD" = success ] || failed="$failed build"
          [ "$PREVIEW" = success ] || failed="$failed preview"
          [ "$LIVE" = success ] || failed="$failed live"
          if [ -n "$failed" ]; then
            printf '[{"name":"pipeline jobs","status":"fail","failures":[{"file":"workflow","message":"job(s) did not succeed:%s"}]}]' "$failed" > results/00-jobs.json
          fi
          set +e
          node .site-pipeline/checks/cli.mjs summary --results results
          rc=$?
          { echo; echo "Preview: ${CANDIDATE:-not deployed} · [run]($RUN_URL) · visual diffs are in the \`visual-diffs\` artifact"; } >> results/summary.md
          exit $rc
      - uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: site-gate
          path: results/summary.md
      - name: Gate
        env:
          BUILD: ${{ needs.build.result }}
          PREVIEW: ${{ needs.preview.result }}
          LIVE: ${{ needs.live.result }}
          SUMMARY: ${{ steps.summary.outcome }}
        run: |
          echo "build=$BUILD preview=$PREVIEW live=$LIVE summary=$SUMMARY"
          [ "$BUILD" = success ] && [ "$PREVIEW" = success ] && [ "$LIVE" = success ] && [ "$SUMMARY" = success ]

  dependabot-merge:
    needs: site-gate
    if: github.event.pull_request.user.login == 'dependabot[bot]' && github.event.pull_request.base.ref == 'staging'
    runs-on: ubuntu-latest
    permissions:
      actions: write
      contents: write
      pull-requests: write
    steps:
      - name: Merge green Dependabot PR into staging, then start the staging deploy
        env:
          GH_TOKEN: ${{ github.token }}
          PR_URL: ${{ github.event.pull_request.html_url }}
          REPO: ${{ github.repository }}
        run: |
          gh pr merge "$PR_URL" --merge
          # A push made with GITHUB_TOKEN never triggers workflows; workflow_dispatch is the exception.
          gh workflow run deploy.yml --repo "$REPO" --ref staging
````

`.github/workflows/site-deploy.yml`:

````yaml
name: site-deploy

# Reusable deploy: build -> upload version -> smoke the version's preview URL -> promote to 100%
# -> check the real hostname -> roll back to the previous version if that check fails.
on:
  workflow_call:
    inputs:
      environment:
        description: "staging or production"
        type: string
        required: true
      host:
        description: production hostname, e.g. w3bbk.us (staging uses staging.<host>)
        type: string
        required: true
      worker:
        description: production Worker name, e.g. w3bbk (staging uses <worker>-staging)
        type: string
        required: true
      smoke-pages:
        type: string
        default: '["/"]'
    secrets:
      CLOUDFLARE_API_TOKEN:
        required: true
      CLOUDFLARE_ACCOUNT_ID:
        required: true

concurrency:
  group: deploy-${{ inputs.environment }}
  cancel-in-progress: false

env:
  TZ: America/New_York
  HUGO_ENVIRONMENT: production
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
    env:
      ENVIRONMENT: ${{ inputs.environment }}
      HOST: ${{ inputs.host }}
      WORKER: ${{ inputs.worker }}
      SMOKE_PAGES: ${{ inputs.smoke-pages }}
    steps:
      - name: Validate inputs
        run: |
          case "$ENVIRONMENT" in
            staging)    echo "ENV_FLAG=--env staging" >> "$GITHUB_ENV"; echo "TARGET_WORKER=${WORKER}-staging" >> "$GITHUB_ENV"; echo "TARGET_HOST=staging.${HOST}" >> "$GITHUB_ENV";;
            production) echo "ENV_FLAG=--env=" >> "$GITHUB_ENV"; echo "TARGET_WORKER=${WORKER}" >> "$GITHUB_ENV"; echo "TARGET_HOST=${HOST}" >> "$GITHUB_ENV";;
            *) echo "::error::environment must be staging or production, got '$ENVIRONMENT'"; exit 1;;
          esac

      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Resolve pinned site-pipeline ref
        id: ref
        run: |
          refs=$(grep -rhoE 'brianbking/site-pipeline/\.github/workflows/[A-Za-z0-9._-]+@[A-Za-z0-9._/-]+' .github/workflows | sed 's/.*@//' | sort -u)
          if [ "$(printf '%s' "$refs" | grep -c .)" != "1" ]; then
            echo "::error::workflows must pin exactly one site-pipeline ref, found: ${refs:-none}"
            exit 1
          fi
          echo "ref=$refs" >> "$GITHUB_OUTPUT"

      - uses: actions/checkout@v4
        with:
          repository: brianbking/site-pipeline
          ref: ${{ steps.ref.outputs.ref }}
          path: .site-pipeline

      - uses: ./.site-pipeline/.github/actions/setup
        with:
          ref: ${{ steps.ref.outputs.ref }}
          toolchain: "true"

      - name: Build
        run: |
          git config core.quotepath false
          hugo --gc --minify

      - name: Offline checks
        run: node .site-pipeline/checks/cli.mjs offline --dir public --host "$HOST"

      - name: Record the version currently serving traffic
        run: |
          # shellcheck disable=SC2086
          npx wrangler deployments status $ENV_FLAG | tee active.txt
          node .site-pipeline/checks/cli.mjs active-version --file active.txt | tee -a "$GITHUB_ENV"

      - name: Upload new version
        env:
          SHA: ${{ github.sha }}
        run: |
          # shellcheck disable=SC2086
          npx wrangler versions upload $ENV_FLAG --message "${ENVIRONMENT} ${SHA}" | tee upload.txt
          node .site-pipeline/checks/cli.mjs version-info --file upload.txt --worker "$TARGET_WORKER" | tee -a "$GITHUB_ENV"

      - name: Smoke the new version before it takes traffic
        run: |
          node .site-pipeline/checks/cli.mjs smoke --base "$PREVIEW" --pages "$SMOKE_PAGES" \
            $([ "$ENVIRONMENT" = staging ] && echo --staging)

      - name: Promote to 100%
        run: |
          # shellcheck disable=SC2086
          npx wrangler versions deploy "${VERSION}@100%" $ENV_FLAG --yes --message "deploy ${GITHUB_SHA}"

      - name: Check the real hostname
        id: hostcheck
        run: |
          # curl, not Node: the zones 403-challenge Node's TLS fingerprint (see pilot findings).
          UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 site-pipeline'
          for i in 1 2 3 4 5 6; do
            code=$(curl -s -o /dev/null -D headers.txt -A "$UA" -w '%{http_code}' "https://${TARGET_HOST}/")
            redirect=$(grep -i '^location:' headers.txt | tr -d '\r' | cut -d' ' -f2 || true)
            robots=$(grep -i '^x-robots-tag:' headers.txt | tr -d '\r' | cut -d' ' -f2- || true)
            echo "attempt $i: code=$code location=$redirect x-robots-tag=$robots"
            if [ "$ENVIRONMENT" = staging ]; then
              # Staging sits behind Cloudflare Access: an unauthenticated request must be redirected to login.
              case "$redirect" in https://*.cloudflareaccess.com/*) exit 0;; esac
            else
              [ "$code" = 200 ] && [[ "$robots" != *noindex* ]] && exit 0
            fi
            sleep 10
          done
          exit 1

      - name: Roll back
        if: failure() && steps.hostcheck.outcome == 'failure' && env.PREVIOUS != ''
        run: |
          # shellcheck disable=SC2086
          npx wrangler versions deploy "${PREVIOUS}@100%" $ENV_FLAG --yes --message "auto-rollback from ${VERSION}"

      - name: Open, update or close the failure issue
        if: always()
        env:
          GH_TOKEN: ${{ github.token }}
          FAILED: ${{ job.status != 'success' }}
        run: |
          node .site-pipeline/checks/cli.mjs issue --title "site-pipeline: ${ENVIRONMENT} deploy failing" \
            $([ "$FAILED" = true ] && echo --failing)
````

`.github/workflows/site-weekly.yml`:

````yaml
name: site-weekly

# Reusable scheduled checks. Each one keeps a single tracking issue: opened or commented while
# failing, closed when it passes again.
on:
  workflow_call:
    inputs:
      host:
        description: production hostname, e.g. w3bbk.us
        type: string
        required: true
      link-exclude:
        description: space-separated lychee --exclude regexes, e.g. "^https://bbking[.]net" (hosts that challenge the checker)
        type: string
        default: ""

env:
  TZ: America/New_York
  HUGO_ENVIRONMENT: production

jobs:
  weekly:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
    env:
      HOST: ${{ inputs.host }}
      LINK_EXCLUDE: ${{ inputs.link-exclude }}
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Resolve pinned site-pipeline ref
        id: ref
        run: |
          refs=$(grep -rhoE 'brianbking/site-pipeline/\.github/workflows/[A-Za-z0-9._-]+@[A-Za-z0-9._/-]+' .github/workflows | sed 's/.*@//' | sort -u)
          if [ "$(printf '%s' "$refs" | grep -c .)" != "1" ]; then
            echo "::error::workflows must pin exactly one site-pipeline ref, found: ${refs:-none}"
            exit 1
          fi
          echo "ref=$refs" >> "$GITHUB_OUTPUT"

      - uses: actions/checkout@v4
        with:
          repository: brianbking/site-pipeline
          ref: ${{ steps.ref.outputs.ref }}
          path: .site-pipeline

      - uses: ./.site-pipeline/.github/actions/setup
        with:
          ref: ${{ steps.ref.outputs.ref }}
          toolchain: "true"

      - name: Build
        run: |
          git config core.quotepath false
          hugo --gc --minify

      - name: security.txt
        id: sectxt
        continue-on-error: true
        run: node .site-pipeline/checks/cli.mjs security-txt --host "$HOST" | tee sectxt.txt

      - name: security.txt issue
        if: always()
        env:
          FAILED: ${{ steps.sectxt.outcome == 'failure' }}
        run: |
          node .site-pipeline/checks/cli.mjs issue --title "site-pipeline: weekly security.txt failing" --file sectxt.txt \
            $([ "$FAILED" = true ] && echo --failing)

      - name: Build lychee exclude args
        run: |
          # Own-site links are already checked offline on every PR. [.] escapes dots without backslashes.
          args="--exclude ^https?://$(printf '%s' "$HOST" | sed 's/[.]/[.]/g')"
          for rx in $LINK_EXCLUDE; do args="$args --exclude $rx"; done
          echo "LYCHEE_EXCLUDES=$args" >> "$GITHUB_ENV"

      - name: External links
        id: lychee
        uses: lycheeverse/lychee-action@v2
        with:
          fail: false
          output: lychee.md
          args: >-
            --no-progress --root-dir ${{ github.workspace }}/public --max-retries 2 --accept 200..=299,429
            ${{ env.LYCHEE_EXCLUDES }}
            'public/**/*.html' 'public/**/*.md' 'public/llms.txt'

      - name: External links issue
        if: always()
        env:
          FAILED: ${{ steps.lychee.outputs.exit_code != '0' }}
        run: |
          node .site-pipeline/checks/cli.mjs issue --title "site-pipeline: weekly link check failing" --file lychee.md \
            $([ "$FAILED" = true ] && echo --failing)
````

- [ ] **Step 5: Write this repo's own workflows**

`.github/workflows/ci.yml`:

````yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch: # toolchain-bump.yml dispatches this: PRs opened with GITHUB_TOKEN trigger nothing

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm test
      - uses: raven-actions/actionlint@v2
````

`.github/workflows/toolchain-bump.yml`:

````yaml
name: toolchain-bump

# Weekly: if Hugo or Dart Sass has a newer release than toolchain.json, open a PR here.
# Sites pick the change up when a new site-pipeline tag reaches them through Dependabot.
on:
  schedule:
    - cron: "0 12 * * 1"
  workflow_dispatch:

permissions:
  actions: write
  contents: write
  pull-requests: write

jobs:
  bump:
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
      - name: Compare with the latest releases
        id: latest
        run: |
          hugo=$(gh api repos/gohugoio/hugo/releases/latest --jq .tag_name | sed 's/^v//')
          sass=$(gh api repos/sass/dart-sass/releases/latest --jq .tag_name)
          jq --arg h "$hugo" --arg s "$sass" '.hugo = $h | .dartSass = $s' toolchain.json > toolchain.new
          mv toolchain.new toolchain.json
          echo "branch=chore/toolchain-hugo-${hugo}-sass-${sass}" >> "$GITHUB_OUTPUT"
          echo "title=chore: bump toolchain to Hugo ${hugo}, Dart Sass ${sass}" >> "$GITHUB_OUTPUT"
      - name: Open a PR when anything changed
        env:
          BRANCH: ${{ steps.latest.outputs.branch }}
          TITLE: ${{ steps.latest.outputs.title }}
        run: |
          if git diff --quiet; then echo "toolchain is current"; exit 0; fi
          if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null; then echo "PR branch already exists"; exit 0; fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git switch -c "$BRANCH"
          git commit -am "$TITLE"
          git push origin "$BRANCH"
          gh pr create --title "$TITLE" --body "Automated weekly toolchain check." --base main --head "$BRANCH"
          gh workflow run ci.yml --ref "$BRANCH"
````

- [ ] **Step 6: Verify the regex bytes survived and lint every workflow**

```powershell
Get-ChildItem .github\workflows\site-*.yml | ForEach-Object {
  $line = (Select-String -Path $_.FullName -Pattern 'grep -rhoE').Line
  $i = $line.IndexOf('site-pipeline/')
  "$($_.Name): " + (($line.Substring($i + 14, 2).ToCharArray() | ForEach-Object { '{0:X2}' -f [int]$_ }) -join ' ')
}
gh release download --repo rhysd/actionlint --pattern '*windows_amd64.zip' --dir $env:TEMP\actionlint --clobber
Expand-Archive $env:TEMP\actionlint\*.zip -DestinationPath $env:TEMP\actionlint -Force
& $env:TEMP\actionlint\actionlint.exe; "exit=$LASTEXITCODE"
```
Expected: each of the three files prints `5C 2E`, the backslash-dot in `\.github`. actionlint prints nothing and `exit=0`.

- [ ] **Step 7: Write `README.md`**

````markdown
# site-pipeline

Shared Cloudflare Worker and GitHub Actions pipeline for the King family Hugo sites.
Design: `.agents/specs/2026-09-23-workers-ci-pipeline-design.md`.

## What a site repo needs

| File | Content |
|---|---|
| `src/worker.js` | `export { default } from "@kingfamily/site-worker";` |
| `package.json` | `"@kingfamily/site-worker": "github:brianbking/site-pipeline#vX.Y.Z"`, `wrangler` as a dev dependency |
| `wrangler.jsonc` | `main`, `preview_urls: true`, `assets` with `binding: "ASSETS"` and `run_worker_first`, `env.staging` with `SITE_ENV=staging` |
| `.github/workflows/pr.yml` · `deploy.yml` · `weekly.yml` | call `site-pr.yml`, `site-deploy.yml`, `site-weekly.yml` here at **one** tag |
| `.github/dependabot.yml` | `github-actions` + `npm`, `target-branch: staging` |

The tag in the site's workflow files is the single pin: CI checks out this repo at that tag
and installs the Worker from it, whatever `package.json` says. Keep `package.json` on the same
tag so local `wrangler dev` runs the same Worker.

## Reusable workflow inputs

| Workflow | Inputs |
|---|---|
| `site-pr.yml` | `host`, `worker`, `visual-pages`, `visual-mask`, `lighthouse-pages` (JSON arrays) |
| `site-deploy.yml` | `environment` (`staging`/`production`), `host`, `worker`, `smoke-pages` |
| `site-weekly.yml` | `host`, `link-exclude` (space-separated lychee regexes) |

Secrets (repo **and** Dependabot): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Development

```bash
npm ci
npm test                                  # Worker + checks
node checks/cli.mjs offline --dir <site>/public --host <host>
```

Release: merge to `main`, then `git tag vX.Y.Z && git push origin vX.Y.Z`. Sites pick the tag up
through Dependabot.
````

- [ ] **Step 8: Run the full suite and commit**

Run: `npx vitest run`
Expected: PASS, 92 tests. Then commit:

```powershell
git add checks/cli.mjs .github/actions/setup/action.yml .github/workflows/site-pr.yml .github/workflows/site-deploy.yml .github/workflows/site-weekly.yml .github/workflows/ci.yml .github/workflows/toolchain-bump.yml README.md
git commit -m "feat: add CLI and reusable site workflows"
```

### Task 7: Publish site-pipeline v0.1.0 — ask Brian first

Outward-facing: this creates a **public** GitHub repo. Get an explicit go-ahead before Step 2.

- [ ] **Step 1: Merge the feature branch locally**

```powershell
git switch main
git merge --no-ff feature/phase0 -m "feat: phase 0 site pipeline"
git branch -d feature/phase0
```

- [ ] **Step 2: Create the public repo and push** (after the go-ahead)

```powershell
gh repo create brianbking/site-pipeline --public --source . --remote origin --push --description "Shared Worker and CI pipeline for the King family sites"
```
Expected: the repo URL is printed and `git status -sb` shows `## main...origin/main`.

- [ ] **Step 3: Allow Actions to open PRs** (used by `toolchain-bump.yml`)

```powershell
gh api -X PUT repos/brianbking/site-pipeline/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```
Then watch the `ci` run: `gh run watch --repo brianbking/site-pipeline --exit-status`
Expected: the run succeeds, with 92 tests and actionlint clean.

- [ ] **Step 4: Tag v0.1.0**

```powershell
git tag -a v0.1.0 -m "v0.1.0: phase 0 pipeline"
git push origin v0.1.0
```

---

## Wave 1 — W3BBK.us pilot

### Task 8: Convert the W3BBK.us repo

**Files** (in `P:\Family_Websites\W3BBK.us`):
- Create: `package.json`, `package-lock.json`, `src/worker.js`, `.github/workflows/pr.yml`, `.github/workflows/deploy.yml`, `.github/workflows/weekly.yml`, `.github/dependabot.yml`
- Replace: `wrangler.jsonc`
- Modify: `.gitignore`, `CLAUDE.md`, `README.md`
- Delete: `functions/`, `static/_routes.json`, `build.sh`

**Interfaces:**
- Consumes: `site-pipeline@v0.1.0`, its package `@kingfamily/site-worker` and its workflow inputs.

- [ ] **Step 1: Precondition — ask Brian**

Run: `git -C P:\Family_Websites\W3BBK.us status --short` and `git -C P:\Family_Websites\W3BBK.us branch -a`.
As of 2026-09-23 the only change was the untracked `_W3BBK.us.url` shortcut, and a remote `development` branch exists. Ask Brian whether the shortcut stays untracked (in which case add it to `.gitignore` in Step 7) and whether `origin/development` is dead. Do not continue until he answers.

- [ ] **Step 2: Branch**

```powershell
Set-Location P:\Family_Websites\W3BBK.us
git switch main; git pull --ff-only
git switch -c feature/workers-ci
```

- [ ] **Step 3: Write the Worker entry and `package.json`, then install**

`src/worker.js`:

```js
export { default } from "@kingfamily/site-worker";
```

`package.json`:

```json
{
  "name": "w3bbk",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "hugo --gc --minify",
    "dev": "hugo --gc --minify && wrangler dev --env=\"\""
  },
  "dependencies": {
    "@kingfamily/site-worker": "github:brianbking/site-pipeline#v0.1.0"
  },
  "devDependencies": {
    "wrangler": "^4.137.0"
  }
}
```

Run: `npm install`
Expected: `package-lock.json` created. `npm ls --depth=0` shows `@kingfamily/site-worker@0.1.0` and `wrangler@4.x`. `node_modules/@kingfamily/site-worker/` contains only `worker/`, `package.json` and `README.md`.

- [ ] **Step 4: Replace `wrangler.jsonc`**

This drops `vars.HUGO_VERSION`, because `toolchain.json` owns Hugo's version now.

````jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "w3bbk",
  "main": "./src/worker.js",
  "compatibility_date": "2026-04-21",
  "workers_dev": false,
  // Every version gets a <id>-w3bbk.<subdomain>.workers.dev URL; CI tests against these.
  "preview_urls": true,
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    // minimal: the Worker runs for every request so negotiation and the staging robots.txt
    // always apply. Upgrade path: a route-pattern array excluding static paths once the
    // pattern syntax is confirmed, to keep asset hits off the Worker request quota.
    "run_worker_first": true
  },
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1,
    "logs": { "enabled": true, "head_sampling_rate": 1, "persist": true, "invocation_logs": true },
    "traces": { "enabled": true, "persist": true, "head_sampling_rate": 1 }
  },
  "env": {
    "staging": {
      "name": "w3bbk-staging",
      "workers_dev": false,
      "preview_urls": true,
      "vars": { "SITE_ENV": "staging" },
      "routes": [{ "pattern": "staging.w3bbk.us", "custom_domain": true }]
    }
  }
}
````

- [ ] **Step 5: Write the workflows and Dependabot config**

`.github/workflows/pr.yml`:

````yaml
name: pr

on:
  pull_request:
    branches: [staging, main]
    types: [opened, synchronize, reopened, labeled, unlabeled]

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  actions: write
  contents: write
  pull-requests: write

jobs:
  site:
    uses: brianbking/site-pipeline/.github/workflows/site-pr.yml@v0.1.0
    with:
      host: w3bbk.us
      worker: w3bbk
    secrets: inherit
````

`.github/workflows/deploy.yml`:

````yaml
name: deploy

on:
  push:
    branches: [staging, main]
  workflow_dispatch: # site-pr's Dependabot auto-merge dispatches this on staging

permissions:
  contents: read
  issues: write

jobs:
  site:
    uses: brianbking/site-pipeline/.github/workflows/site-deploy.yml@v0.1.0
    with:
      environment: ${{ github.ref_name == 'main' && 'production' || 'staging' }}
      host: w3bbk.us
      worker: w3bbk
      smoke-pages: '["/", "/llms.txt", "/.well-known/agent-card.json"]'
    secrets: inherit
````

`.github/workflows/weekly.yml`:

````yaml
name: weekly

on:
  schedule:
    - cron: "0 13 * * 1" # Mondays 13:00 UTC
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  site:
    uses: brianbking/site-pipeline/.github/workflows/site-weekly.yml@v0.1.0
    with:
      host: w3bbk.us
````

`.github/dependabot.yml`:

````yaml
version: 2
updates:
  # Also bumps the brianbking/site-pipeline@vX.Y.Z pin in all three workflow files in one PR.
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    target-branch: staging
    groups:
      actions:
        patterns: ["*"]
        update-types: [minor, patch]

  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    target-branch: staging
    groups:
      npm:
        patterns: ["*"]
        update-types: [minor, patch]
````

- [ ] **Step 6: Remove the Pages-era files**

```powershell
git rm -r functions static/_routes.json build.sh
```

- [ ] **Step 7: Update `.gitignore` and the docs**

Append to `.gitignore`:

```
.wrangler/
.site-pipeline/
gate-out/
```
(and `_W3BBK.us.url` if Brian said so in Step 1).

In `CLAUDE.md`:
- Replace "Hugo static site hosted on Cloudflare Pages, with a Pages Functions middleware layer." with "Hugo static site served by the Cloudflare Worker `w3bbk`, using the shared `site-pipeline` Worker."
- Replace the whole `## Deployment` section body with: "PR into `staging` → preview URL and checks (`site-gate`) → merge → staging.w3bbk.us (Access login) → PR `staging` → `main` → production. GitHub Actions deploys via `brianbking/site-pipeline`; see its README. Hugo's version is pinned in site-pipeline's `toolchain.json`."
- Replace "Cloudflare Pages builds from source on every push to `main`." with "GitHub Actions builds from source."
- Rename `## Cloudflare Pages` to `## Cloudflare`, and replace its `functions/_middleware.js` bullet with "`src/worker.js` — re-exports the shared Worker (markdown negotiation, `Link` alternate, staging `noindex`) from `@kingfamily/site-worker`".

In `README.md`: change the `Hosting` row to `[Cloudflare Workers](https://developers.cloudflare.com/workers/) static assets`, change the `Middleware` row to `Shared Worker from brianbking/site-pipeline`, and replace "Cloudflare Pages builds from source on deploy" with "GitHub Actions builds from source on deploy".

- [ ] **Step 8: Verify locally**

Run each of these separately:

```powershell
npm run build
node ..\site-pipeline\checks\cli.mjs offline --dir public --host w3bbk.us; "exit=$LASTEXITCODE"
npx wrangler deploy --dry-run --env="" --outdir $env:TEMP\w3-dry
npx wrangler deploy --dry-run --env staging --outdir $env:TEMP\w3-dry-stg
```
Expected: `PASS offline checks`, `exit=0`. Both dry runs end `--dry-run: exiting now.` with no `Multiple environments` warning. The staging run lists `env.SITE_ENV ("staging")`.

Then start `npx wrangler dev --env="" --port 8787` and `npx wrangler dev --env staging --port 8788 --inspector-port 9230` (Bash tool, `run_in_background`), and run:

```powershell
node ..\site-pipeline\checks\cli.mjs smoke --base http://127.0.0.1:8787 --pages '["/", "/llms.txt", "/.well-known/agent-card.json"]'; "exit=$LASTEXITCODE"
node ..\site-pipeline\checks\cli.mjs smoke --base http://127.0.0.1:8788 --staging; "exit=$LASTEXITCODE"
```
Expected: `PASS smoke (production)` / `exit=0` and `PASS smoke (staging)` / `exit=0`. Stop both dev servers afterwards, and confirm with `Get-NetTCPConnection -LocalPort 8787,8788 -State Listen` that nothing is left listening.

- [ ] **Step 9: Commit**

```powershell
git add package.json package-lock.json src/worker.js wrangler.jsonc .github/workflows/pr.yml .github/workflows/deploy.yml .github/workflows/weekly.yml .github/dependabot.yml .gitignore CLAUDE.md README.md
git status --short   # expect only the files above plus the staged deletions from Step 6
git commit -m "feat: deploy via site-pipeline on Workers"
```

### Task 9: Accounts and dashboard setup — Brian, with Claude guiding

None of this can be automated safely, so each item is Brian's action. Claude verifies each one where a command can.

- [ ] **Step 1: Cloudflare API token** (King Family account). Go to My Profile → API Tokens → Create Token → Custom. Permissions: *Account · Workers Scripts · Edit*. Account resources: *King Family* only. Name it `site-pipeline-king-family`. Keep the value in 1Password as `op://Personal/site-pipeline-king-family/credential`, and store the King Family account ID (`npx wrangler whoami`) in the same item's `account_id` field.

- [ ] **Step 2: Repo secrets, Actions and Dependabot** (Brian runs these; the token never enters the conversation):

```powershell
$t = op read "op://Personal/site-pipeline-king-family/credential"
foreach ($app in 'actions','dependabot') {
  $t | gh secret set CLOUDFLARE_API_TOKEN --app $app --repo brianbking/W3BBK
  op read "op://Personal/site-pipeline-king-family/account_id" | gh secret set CLOUDFLARE_ACCOUNT_ID --app $app --repo brianbking/W3BBK
}
Remove-Variable t
```
Verify: `gh secret list --app actions --repo brianbking/W3BBK` and `gh secret list --app dependabot --repo brianbking/W3BBK` each list both names.

- [ ] **Step 3: Branch, label and Actions permissions**

```powershell
git -C P:\Family_Websites\W3BBK.us push origin main:staging
gh label create approved-visual-change --repo brianbking/W3BBK --color FBCA04 --description "Accept this PR's visual diff"
gh api -X PUT repos/brianbking/W3BBK/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

- [ ] **Step 4: Bootstrap the staging Worker and its domain** (one-time; `versions upload` needs the Worker to exist)

On `feature/workers-ci`, run `npm run build`, then `npx wrangler deploy --env staging`.
Expected: `w3bbk-staging` deployed, with `staging.w3bbk.us (custom domain)` listed.

- [ ] **Step 5: Cloudflare Access for staging.** Go to Zero Trust → Access → Applications → Add → Self-hosted. Domain: `staging.w3bbk.us`. Policy: *Allow*, Include *Emails* = Brian's address. Verify with `curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" https://staging.w3bbk.us/`.
Expected: `302 https://<team>.cloudflareaccess.com/...`.

- [ ] **Step 6: Leave the Workers Builds Git connection ON for now.** It keeps deploying `main` until the cutover in Task 11.

### Task 10: First PR through the pipeline, and the platform findings

**Files:**
- Create (in site-pipeline): `.agents/findings/2026-09-XX-w3bbk-pilot.md`, dated the day it's written.

- [ ] **Step 1: Push and open the PR into `staging`**

```powershell
git -C P:\Family_Websites\W3BBK.us push -u origin feature/workers-ci
gh pr create --repo brianbking/W3BBK --base staging --head feature/workers-ci --title "feat: deploy via site-pipeline on Workers" --body "Pilot for site-pipeline v0.1.0."
gh run watch --repo brianbking/W3BBK --exit-status
```

- [ ] **Step 2: Evaluate the run against the ask.** Read the `site-gate` PR comment. Every row should be green except possibly `visual regression`, because the baseline is the current production version, which is served with no Worker in front.
  - **If visual differs:** open the `visual-diffs` artifact. A difference caused only by the new `Link`/`Vary` headers is impossible (headers don't render). Any visible difference is a real regression to investigate with `/systematic-debugging`, not something to label away.
  - **If `preview` failed parsing wrangler output:** save the real `upload.txt` and `active.txt` from the job log. Add them as a failing test case in `test/gates.test.js`, fix `checks/lib/ci.mjs`, and release a new patch tag. The test that shows the real format wins over the assumed one.

- [ ] **Step 3: Record the platform findings.** Write the findings file with one short paragraph per question, each with the evidence (command and output):
  1. Which Cloudflare feature 403s Node's `fetch` on the zones (Security → Events for a `cf-mitigated: challenge` request). Is it Bot Fight Mode or a rule?
  2. Do `_headers` rules apply to Worker responses from `env.ASSETS.fetch` on a real deploy? Check with `curl.exe -sI -A "Mozilla/5.0" <preview-url>` for `content-security-policy` and `strict-transport-security`. (Locally: yes.)
  3. Do preview URLs work with `workers_dev: false` + `preview_urls: true`?
  4. Is the missing `run_worker_first` the reason `src/worker.js` never negotiated on BrianBK.ing, JillK.ing and KingFamily?
  5. The real `wrangler versions upload` and `deployments status` output lines.
  6. Are `workers.dev` preview URLs free of the zone challenge? (Node `fetch` returned 200 in the `live` job.)

Commit the findings file to site-pipeline `main`, with the message `docs: record W3BBK pilot platform findings`.

- [ ] **Step 4: Iterate on the specific weak point only.** Fix each red check at its source, in site-pipeline if the shared code is wrong or in W3BBK if the site is. Push, and let the PR re-run. Don't loosen a threshold to get to green.

### Task 11: Cutover and exit criteria — ask Brian before each merge

- [ ] **Step 1: Disconnect Workers Builds.** In the Workers & Pages dashboard, open `w3bbk` → Settings → Build → disconnect the Git repository. Otherwise every push to `main` deploys twice.

- [ ] **Step 2: Merge the pilot PR into `staging`** (go-ahead first): `gh pr merge --repo brianbking/W3BBK --merge feature/workers-ci`, then `gh run watch --repo brianbking/W3BBK --exit-status`.
Expected: the `deploy` run on `staging` succeeds, with smoke on the version preview, promotion, and the Access redirect check.

- [ ] **Step 3: Promote to production** (go-ahead first):

```powershell
gh pr create --repo brianbking/W3BBK --base main --head staging --title "chore: promote staging to production" --body "Pilot cutover."
gh run watch --repo brianbking/W3BBK --exit-status        # site-gate on the promotion PR
gh pr merge --repo brianbking/W3BBK --merge staging
gh run watch --repo brianbking/W3BBK --exit-status        # production deploy
```

- [ ] **Step 4: Verify production by hand** (curl, which the zone lets through):

```powershell
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
curl.exe -s -D - -o NUL -A $ua -H "Accept: text/markdown" https://w3bbk.us/ | Select-String -Pattern '^(HTTP|content-type|x-markdown-tokens|vary)'
curl.exe -s -D - -o NUL -A $ua https://w3bbk.us/ | Select-String -Pattern '^(HTTP|link|x-robots-tag)'
```
Expected: `HTTP/1.1 200`, `content-type: text/markdown; charset=utf-8`, a numeric `x-markdown-tokens`, and `vary: Accept`. The HTML response's `link` includes `<https://w3bbk.us/index.md>; rel="alternate"; type="text/markdown"`, and `x-robots-tag` is `noai, noimageai` (no `noindex`). This is the first time w3bbk.us has served markdown in production.

- [ ] **Step 5: Exercise the paths not yet run**
  - The Dependabot staging dispatch path: `gh workflow run deploy.yml --repo brianbking/W3BBK --ref staging`, then `gh run watch`. Expected: success.
  - The weekly checks: `gh workflow run weekly.yml --repo brianbking/W3BBK`, then `gh run watch`. Expected: success with no new issue. If the link check trips on a family domain's bot challenge, add that host to `link-exclude` in `weekly.yml` as `^https://bbking[.]net` and record it in the findings.
  - Rollback: `npx wrangler deployments list --env=""` shows the new version and the previous Workers Builds versions, the rollback target. Don't trigger a rollback on purpose in production.

- [ ] **Step 6: Exit criteria.** Wave 1 is done when all of these hold: one real PR went green through every gate; production smoke passed; markdown negotiation is verified live (Step 4); one weekly run is green; the findings file is committed. Then update `.agents/tasks/backlog.md` in site-pipeline (wave 1 → Completed) and write the wave 2 (BBKing.net) plan from the findings.
