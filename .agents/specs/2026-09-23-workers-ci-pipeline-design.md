# Workers + GitHub Actions pipeline for the King family sites — design

_Status: approved in conversation 2026-09-23; awaiting written-spec review._

## Goal

Build and deploy all six Hugo sites from GitHub Actions to Cloudflare Workers, with one shared
Worker implementation, PR previews, a gated staging site, and a check suite that catches
regressions before production. Stay on Hugo and on free tiers.

## Current state (verified 2026-09-23)

| Site | GitHub repo | Cloudflare account | Live as | Markdown negotiation live |
|---|---|---|---|---|
| W3BBK.us | `brianbking/W3BBK` | King Family | Worker `w3bbk` (assets only) | no |
| BBKing.net | `brianbking/BBKing` | King Family | Worker `bbking` (assets only) | no |
| KingFamily (kingfamily.info) | `brianbking/KingFamily` | King Family | Worker `kingfamily` + `src/worker.js` | no |
| BrianBK.ing | `brianbking/BrianBK.ing` | King Family | Worker `brianbking` + `src/worker.js`; stale Pages project `brianbking.pages.dev` | no |
| JillK.ing | `brianbking/JillK.ing` | King Family | Worker `jillking` + `src/worker.js` | no |
| MasonBK.ing | `mbking412/MasonBK.ing` | M@sonBK.ing | Pages project `masonbking` | yes |

- All repos are **private**; default branch `main`; none has `.github/`.
- Five Workers were last deployed 2026-05-28/29, presumably via Workers Builds (Git integration).
- Markdown negotiation: `functions/_middleware.js` + `functions/lib/negotiate.js` are byte-identical in
  all six repos but only run on Pages. The three `src/worker.js` files are a looser, divergent
  reimplementation, and never run for HTML routes because assets are served before the Worker (no
  `run_worker_first`) — to be confirmed in Phase 0.
- `negotiate.js` cites `negotiate.test.js`; that file exists in no repo.
- `static/_headers` in BrianBK.ing and JillK.ing advertise `kingfamily.info` URLs (copy-paste bug).
- BrianBK.ing and JillK.ing build a résumé PDF with Puppeteer + `@sparticuz/chromium`.
- Formspree forms: BrianBK.ing, JillK.ing, KingFamily, MasonBK.ing — one shared partial
  (`layouts/partials/contact-form.html`); BrianBK.ing and KingFamily share form ID `mgeggkzw`.
- `/.well-known/security.txt` is served on all six zones by Cloudflare Security Center
  (`Contact: mailto:security@<domain>`, `Expires: 2029-12-31T23:59:00Z`). `security@` aliases live in Fastmail.
- Requests with curl's default user agent receive a 403 challenge; a browser UA receives 200.

## Decisions

| Topic | Decision |
|---|---|
| Scope | All six sites |
| Code layout | Six site repos + one shared **public** `brianbking/site-pipeline` repo, consumed by pinned tag |
| Environments | Per-PR preview URLs **and** a `staging.<domain>` Worker per site |
| Access | Cloudflare Access login on staging only; PR previews ungated |
| Visual regression | PR preview vs current production version; label override |
| Lighthouse | A11y/BP/SEO ≥ 95 hard; Performance relative (≤ 10 pts below prod) |
| Formspree | Offline check per PR; weekly real canary submission |
| `.well-known` | Validate served files; `security.txt` stays dashboard-managed |
| Dependabot | Auto-merge all green updates (majors included) into `staging` |
| Repo visibility | Stay private on GitHub Free; gates are **advisory-by-convention** (see below) |
| Pilot order | W3BBK.us → BBKing.net → KingFamily → BrianBK.ing + JillK.ing → MasonBK.ing |

**Consequence of private + Free:** private repos cannot have branch protection or required status
checks, and `gh pr merge --auto` fails without them. Enforcement therefore lives in the pipeline:
Dependabot PRs are merged by a workflow job only when `site-gate` is green; human PRs are merged by
hand only on green, by convention. GitHub Environments (and environment-scoped secrets) are also
unavailable on private repos under Free, so all secrets are repo-level.

## Architecture

### `site-pipeline` (public, tagged `vX.Y.Z`)

```
worker/            index.js (fetch handler), negotiate.js, test/
checks/            *.mjs spec validators + fixtures that must fail them
.github/workflows/ site-pr.yml, site-deploy.yml, site-weekly.yml, toolchain-bump.yml, ci.yml
toolchain.json     pinned Hugo extended + Dart Sass versions (single source)
```

Published to sites as an npm git dependency: `"@kingfamily/site-worker":
"github:brianbking/site-pipeline#vX.Y.Z"`. It must be public because a private repo's reusable
workflows cannot be called from another account (`mbking412`).

### Per site repo

- `src/worker.js` — `export { default } from "@kingfamily/site-worker";`
- `wrangler.jsonc` — `main`, `assets` (binding `ASSETS`, `run_worker_first` = HTML routes + `/robots.txt`),
  `env.staging` (name `<site>-staging`, route `staging.<domain>`, `vars.SITE_ENV = "staging"`).
- `.github/workflows/{pr,deploy,weekly}.yml` — thin callers pinning `site-pipeline@vX.Y.Z`; inputs:
  canonical host, visual/Lighthouse page lists, Formspree IDs, `pdf: true|false`.
- `.github/dependabot.yml` — `github-actions` weekly; `npm` weekly where `package.json` exists;
  non-major updates grouped.
- Removed: `functions/`, `static/_routes.json`, `build.sh`. `_headers` and `_redirects` stay.

## Pipeline

Branch flow: feature → PR into `staging` → merge → PR `staging` → `main` → merge.

| Trigger | Jobs |
|---|---|
| PR (any base) | build → offline checks → `wrangler versions upload --preview-alias pr-<N>` → online checks vs preview → `site-gate` + PR comment |
| Dependabot PR | as above; on green `site-gate`, a job with `contents: write` merges into `staging` |
| push `staging` | build → `wrangler deploy --env staging` → staging smoke (Access service token) |
| push `main` | build → `wrangler versions upload` → `wrangler versions deploy <id>@100%` → prod smoke; on failure `wrangler rollback` + issue |
| weekly, site repo | external link check, Formspree canary, `security.txt` validation/expiry |
| weekly, `site-pipeline` | Hugo / Dart Sass / Chromium / `site-pipeline` release check → bump PRs in each site repo |

- Build once per run; `public/` passes between jobs as an artifact.
- `concurrency` per ref; newer PR pushes cancel older runs; deploys never overlap.
- Comparison baseline for visual and Lighthouse checks is the **active production version's
  preview URL**, not the production hostname — same content, no bot challenge.

### Secrets (per site repo)

`CLOUDFLARE_API_TOKEN` (account-scoped, Workers Scripts: Edit only; one token per Cloudflare
account), `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
**`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are also added as Dependabot secrets** —
Dependabot-triggered runs cannot read Actions secrets.

## Worker behaviour

Port of the canonical middleware, semantics unchanged:

1. **Negotiate.** GET/HEAD where `prefersMarkdown(Accept)` (markdown q strictly greater than HTML
   q) → fetch `mdSiblingPath(pathname)` from `env.ASSETS`; on 200 return it with
   `Content-Type: text/markdown; charset=utf-8`, `X-Markdown-Tokens`, `Content-Signal`,
   `Content-Usage`, `Vary: Accept`; empty body on HEAD. Any error or non-200 → fall through.
2. **Advertise.** On 200 `text/html`, append `Link: <md>; rel="alternate"; type="text/markdown"`
   and add `Accept` to `Vary`.
3. **Staging.** When `SITE_ENV === "staging"`: `X-Robots-Tag: noindex, nofollow` on every
   response; `/robots.txt` → `User-agent: *` / `Disallow: /`.

Behaviour change: sites on the old `src/worker.js` served markdown to any Accept containing
`text/markdown`; equal-q `text/markdown, text/html` now yields HTML.

Tests: characterization tests written against the current `negotiate.js`/middleware **before**
porting; then unit tests (`negotiate.js`) and integration tests via
`@cloudflare/vitest-pool-workers` covering negotiation, fallback, HEAD, `Link`, `Vary`, staging.
A `site-pipeline` tag is cut only on green.

## Checks

| Check | When | Result |
|---|---|---|
| Hugo build `--gc --minify` (+ PDF where enabled) | every run | gate |
| Internal links (lychee `--offline` on `public/`) | PR | gate |
| `llms.txt` structure + links resolve; `.md` siblings exist for advertised pages; `sitemap.xml` XSD + `<loc>` exist + production host; `robots.txt` parses + `Sitemap:` host; `agent-card.json` against A2A schema; `site.webmanifest` + icons; `_headers` `Link` URLs on own domain | PR | gate |
| Formspree offline: action `https://formspree.io/f/<id>`, ID matches `params.toml`, required fields, CSP permits the POST | PR | gate |
| Preview upload | PR | gate |
| Markdown negotiation live against preview | PR | gate |
| Visual regression (Playwright, 5–8 pages × mobile + desktop, dynamic regions masked) | PR | gate; > 0.1 % pixels differ on any page → red unless label `approved-visual-change` |
| Lighthouse (`@lhci/cli`, 3 pages, mobile, median of 3) | PR | gate: A11y/BP/SEO ≥ 95; Perf red only if > 10 pts below prod |
| Staging smoke (200s, `noindex`, negotiation) | push `staging` | red run + issue |
| Production smoke | push `main` | auto-rollback + issue |
| External links (lychee against prod) | weekly | issue |
| Formspree canary (POST, `Accept: application/json`, expect `{"ok":true}`, subject `[CI canary]`) | weekly | issue |
| `security.txt` served: fields parse (RFC 9116), `Contact` on own domain, warn ≤ 30 days to `Expires` | weekly | issue |

Rules:
- Weekly failures update one open issue per check per repo; the issue closes on the next pass.
- A red gate names the check, page, and observed vs expected value in the PR comment.
- Every check ships with a fixture that must make it fail and must name the offending file.

Budget estimate (unverified, re-measure after wave 2): ~700 of 2,000 monthly Actions minutes on
`brianbking`; MasonBK.ing uses `mbking412`'s separate 2,000. Cloudflare Free: 12 Workers of 100
per account; `run_worker_first` keeps asset requests off the 100k/day Worker request limit; Access
free to 50 users.

## Rollout

**Phase 0 — `site-pipeline`.** Worker + tests, checks + failing fixtures, reusable workflows.
Resolve and record: (1) which Cloudflare feature challenges curl's UA, and whether CI uses a WAF
skip rule on a secret header or an explicit UA; (2) whether `_headers` rules apply to responses
returned via `env.ASSETS.fetch` from the Worker — if not, the Worker applies them; (3) whether
preview URLs work with `workers_dev: false` or need `preview_urls: true`; (4) that missing
`run_worker_first` is why the existing `worker.js` never negotiates. Tag `v0.1.0`.

**Per-site wave.**
1. Precondition: clean tree; open branches merged or parked — decided by Brian per site.
2. Branch `feature/workers-ci`: workflows, `worker.js`, `wrangler.jsonc`, `dependabot.yml`,
   site fixes (e.g. `_headers` host), delete `functions/`, `_routes.json`, `build.sh`; update
   CLAUDE.md / README deploy sections.
3. Manual setup checklist: repo + Dependabot secrets; `staging.<domain>` custom domain; Access
   application + service token for it; `staging` branch.
4. Baseline Lighthouse + spec checks against current output; sub-threshold findings are fixed
   before that gate is enabled.
5. Cutover: disconnect Workers Builds Git integration, then merge. Same Worker name and custom
   domain — no DNS change.
6. Exit: one real PR green through every gate; prod smoke green; negotiation verified live with a
   browser UA; one weekly run green.

Tag `site-pipeline` `v1.0.0` after wave 2 (BBKing.net); later waves change configuration only.

**MasonBK.ing.** Deploy Worker `masonbking` to the M@sonBK.ing account; verify on its preview URL;
move `masonbk.ing` from the Pages project to the Worker custom domain at a quiet hour (brief 5xx
window possible). Keep the Pages project 14 days as rollback, then delete with confirmation.
Delete stale `brianbking.pages.dev` in wave 4 after confirming no custom domain is attached.

## Rollback

| Failure | Recovery |
|---|---|
| Bad release | Automatic `wrangler rollback` on smoke failure; manual via the same command or dashboard |
| Pipeline broken | Reconnect Workers Builds (dashboard toggle); deploys continue while CI is fixed |
| Bad `site-pipeline` release | Sites stay on their pinned tag until a bump PR passes their own gates |
| MasonBK.ing cutover fails | Re-attach `masonbk.ing` to the retained Pages project |

## Open items

- Is the shared Formspree ID `mgeggkzw` (BrianBK.ing + KingFamily) intentional?
- Contact form name `pattern="[A-Za-z\s]+"` rejects hyphens, apostrophes and accents — out of
  scope unless pulled in.
- `security.txt` `Expires` is 2029; RFC 9116 recommends (SHOULD) under one year. No change planned.

## Out of scope

Leaving Hugo; monorepo consolidation; making repos public or buying GitHub Pro; content changes;
CDN/SRI dependency updates in `params.toml`.
