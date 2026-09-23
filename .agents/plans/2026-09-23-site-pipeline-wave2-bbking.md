# site-pipeline Wave 2 — BBKing.net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move bbking.net from Workers Builds (assets only, unused Pages Functions) to GitHub Actions → Cloudflare Workers through `site-pipeline`, with PR previews, `staging.bbking.net` and markdown negotiation live. Then tag `site-pipeline` `v1.0.0`.

**Architecture:** This is a port of the wave 1 configuration, not new pipeline code. BBKing.net is a near-exact twin of pre-pilot W3BBK.us (same templates, `_headers`, `functions/`, `build.sh`, Worker shape), so each site file below is W3BBK's current file with `w3bbk` → `bbking` and `w3bbk.us` → `bbking.net`. The site's workflow tag is the single pin (`v0.1.7`, the release W3BBK runs in production).

**Tech Stack:** Hugo extended 0.162.0 + Dart Sass 1.89.2 in CI (site-pipeline `toolchain.json`); Wrangler 4.137+; Node 24; GitHub Actions; Lighthouse 13 (local baseline only).

**Spec:** `.agents/specs/2026-09-23-workers-ci-pipeline-design.md`. Its **"Revisions from planning and the W3BBK pilot"** table binds where it disagrees with the text above it. Pilot findings: `.agents/findings/2026-09-23-w3bbk-pilot.md`. Reference implementation: `P:\Family_Websites\W3BBK.us` at `67d6186`.

## Global Constraints

- Site-pipeline pin is **`v0.1.7`** in all three workflow files **and** `package.json`. `site-pr.yml` fails the build if the workflow pins differ.
- `package.json` dependency form is `git+https://github.com/brianbking/site-pipeline.git#v0.1.7`. `npm install` rewrites it to `github:` shorthand, so re-edit it afterwards (pilot finding) and check with `Select-String`.
- Production wrangler commands pass `--env=""` explicitly (`--env=` in YAML).
- Secrets never go in files or in the conversation. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set as repo **Actions and Dependabot** secrets by a script Brian runs. Never set them with an inline `-Command`.
- **Claude never runs `git push`** (hard-denied). Every push step is labelled *Brian runs*; Brian runs it with the `!` prefix. Anything else outward-facing (PR merge, dashboard, tag, branch delete) happens only after Brian says go for that step.
- Commits: Conventional Commits, summary ≤ 50 characters (measure it with `'<summary>'.Length`), no `Co-Authored-By` trailer, stage by explicit path, never `git add -A`.
- Windows host: run commands through the PowerShell tool unless a step says Bash. Local Hugo is 0.166.0, CI's is 0.162.0. A difference that shows up only locally is not a finding.
- BBKing.net has **no git hooks installed**. Task 2 Step 1 installs them before any other commit.

## Review Focus

1. **The footer fails the accessibility gate.** Lighthouse on the current build (2026-09-23, local) scores Accessibility **87**. The only failing audit is `color-contrast` on the footer `<small>` (`.mastfoot` `opacity: 0.6`), the same defect W3BBK had. The A11y gate is absolute ≥ 95, so the first PR would go red. Pinned by Task 1's before/after Lighthouse run.
2. **`.hugo_build.lock` is tracked** even though `.gitignore` lists it (W3BBK doesn't track it). Every local build dirties the tree. Task 2 untracks it and checks `git status` after a build.
3. **The PR preview has no URL.** `wrangler versions upload` prints no `Version Preview URL:` until the dashboard's Preview URLs toggle is on for `bbking` (pilot finding 3). Then the `preview` gate fails with a parse error that looks like a pipeline bug. Pinned by Task 3 Step 5, which is verified before the PR opens.
4. **Double deploys, or a deploy gap, at cutover.** Workers Builds keeps deploying `main` until it is disconnected. Disconnect it too early and prod stops updating; too late and every push deploys twice. Task 5 Step 1 disconnects it immediately before the first merge to `main`, and not before.
5. **The staging Access gate is unverified.** CI cannot reach `staging.bbking.net` past the runner challenge (spec Revisions → Access). Task 3 Step 7 is the only check; it expects a `302` to `*.cloudflareaccess.com`, and a `200` there means staging is public.

---

## File Structure

`P:\Family_Websites\BBKing.net\` on branch `feature/workers-ci`:

| File | Change | Responsibility |
|---|---|---|
| `assets/sass/main.scss` | Modify line 30 | Footer contrast (Task 1) |
| `src/worker.js` | Create | Re-export `@kingfamily/site-worker` |
| `package.json`, `package-lock.json` | Create | Worker dependency at `v0.1.7`, `wrangler` dev dependency |
| `wrangler.jsonc` | Replace | Worker `bbking`, assets binding, `run_worker_first`, `env.staging` |
| `.github/workflows/pr.yml`, `deploy.yml`, `weekly.yml` | Create | Thin callers of site-pipeline's reusable workflows |
| `.github/dependabot.yml` | Create | `github-actions` + `npm`, target `staging` |
| `.gitignore` | Modify | `.wrangler/`, `.site-pipeline/`, `gate-out/` |
| `.hugo_build.lock` | Untrack | Build artefact |
| `CLAUDE.md`, `README.md` | Modify | Deploy and hosting wording |
| `functions/`, `static/_routes.json`, `build.sh` | Delete | Pages-era files |

`P:\Family_Websites\site-pipeline\`: `.agents/findings/2026-09-23-w3bbk-pilot.md` (append a wave 2 section), `.agents/tasks/backlog.md`, and the `v1.0.0` tag.

---

## Wave 2 — BBKing.net

### Task 1: Footer contrast to WCAG AA

**Files:**
- Modify: `P:\Family_Websites\BBKing.net\assets\sass\main.scss:30`

**Interfaces:** none. This is a style fix, kept separate so a reviewer can judge it on its own.

- [ ] **Step 1: Precondition and branch**

```powershell
Set-Location P:\Family_Websites\BBKing.net
git status --short --branch     # expect: ## main...origin/main [ahead 2] (or in sync), nothing else
git switch -c feature/workers-ci
```
If the tree isn't clean, stop and ask Brian. `origin/development` is already fully merged into `main` (0 commits ahead, checked 2026-09-23). Its deletion is Brian's call in Task 3 Step 1.

- [ ] **Step 2: Serve the current build (Bash tool, background)**

```bash
cd P:/Family_Websites/BBKing.net && hugo --gc --minify --destination "$TEMP/bbking-lh" --quiet && cd "$TEMP/bbking-lh" && python -m http.server 8799 --bind 127.0.0.1
```
Use `run_in_background`. Check it's up with `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8799/` → `200`.

- [ ] **Step 3: Run Lighthouse to see it fail**

```powershell
Set-Location P:\Family_Websites\site-pipeline
$j = Join-Path $env:TEMP 'bbking-lh-before.json'
npx lighthouse http://127.0.0.1:8799/ --only-categories=accessibility --form-factor=mobile --output=json --output-path=$j --quiet --chrome-flags="--headless=new"
$r = Get-Content $j -Raw | ConvertFrom-Json; "a11y=" + [math]::Round($r.categories.accessibility.score*100); "contrast=" + $r.audits.'color-contrast'.score
```
Expected: `a11y=87`, `contrast=0`. Lighthouse exits 1 on Windows because chrome-launcher hits `EPERM` deleting its temp profile. That happens after the report is written, so judge the result by the JSON, not the exit code.

- [ ] **Step 4: Fix**

In `assets/sass/main.scss` line 30, replace `opacity: 0.6;` with:

```scss
  opacity: 0.7; // 0.6 put the footer text under WCAG AA contrast (Lighthouse color-contrast)
```
Keep the line's existing indentation. This is W3BBK's line from `bd33419`, word for word.

- [ ] **Step 5: Rebuild and re-run to see it pass**

Stop the background server, re-run Step 2's command, then Step 3 with `bbking-lh-after.json`.
Expected: `a11y` ≥ 95 and `contrast=1`. If `contrast` is still `0`, BBKing's colours differ from W3BBK's. Stop and report the failing node and ratio from `$r.audits.'color-contrast'.details.items`; don't guess a new value.
Then stop the server, and confirm with `Get-NetTCPConnection -LocalPort 8799 -State Listen -ErrorAction SilentlyContinue` that nothing is listening.

- [ ] **Step 6: Commit**

```powershell
git add -- assets/sass/main.scss
git commit -m "fix: raise footer contrast to WCAG AA"
```

### Task 2: Convert the repo to site-pipeline

**Files** (in `P:\Family_Websites\BBKing.net`):
- Create: `src/worker.js`, `package.json`, `package-lock.json`, `.github/workflows/pr.yml`, `.github/workflows/deploy.yml`, `.github/workflows/weekly.yml`, `.github/dependabot.yml`
- Replace: `wrangler.jsonc`
- Modify: `.gitignore`, `CLAUDE.md`, `README.md`
- Delete: `functions/`, `static/_routes.json`, `build.sh`; untrack `.hugo_build.lock`

**Interfaces:**
- Consumes: `brianbking/site-pipeline@v0.1.7`: the package `@kingfamily/site-worker`, the `site-pr.yml` inputs `host`/`worker` (defaults `visual-pages` / `lighthouse-pages` = `["/"]`), the `site-deploy.yml` inputs `environment`/`host`/`worker`/`smoke-pages`, and the `site-weekly.yml` input `host`.
- Produces: Worker names `bbking` / `bbking-staging` and the host `staging.bbking.net`, which Tasks 3–5 use.

- [ ] **Step 1: Install the git hooks**

```powershell
Set-Location P:\Family_Websites\BBKing.net
powershell -NoProfile -File "$env:USERPROFILE\.claude\scripts\git-hooks\Install-Hooks.ps1"
Test-Path .git\hooks\pre-commit; Test-Path .git\hooks\commit-msg
```
Expected: `True` twice.

- [ ] **Step 2: Untrack the Hugo lock file**

```powershell
git rm --cached -- .hugo_build.lock
git commit -m "chore: stop tracking .hugo_build.lock"
```
`.gitignore` already lists it. Verify: `hugo --gc --minify --quiet; git status --short` shows no `.hugo_build.lock` line. Then `Remove-Item -Recurse public` (build output, ignored).

- [ ] **Step 3: Write the Worker entry and `package.json`, then install**

`src/worker.js`:

```js
export { default } from "@kingfamily/site-worker";
```

`package.json`:

```json
{
  "name": "bbking",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "hugo --gc --minify",
    "dev": "hugo --gc --minify && wrangler dev --env=\"\""
  },
  "dependencies": {
    "@kingfamily/site-worker": "git+https://github.com/brianbking/site-pipeline.git#v0.1.7"
  },
  "devDependencies": {
    "wrangler": "^4.137.0"
  }
}
```

Run: `npm install`
Then run `Select-String -Path package.json -Pattern 'site-worker'`. If the line now reads `github:brianbking/site-pipeline#v0.1.7`, restore the `git+https://...#v0.1.7` form above and run `npm install` again. Expected: `npm ls --depth=0` shows `@kingfamily/site-worker@0.1.7` and `wrangler@4.x`. A `git+ssh` URL in `package-lock.json` is expected and harmless (pilot finding).

- [ ] **Step 4: Replace `wrangler.jsonc`**

This drops `vars.HUGO_VERSION`: site-pipeline's `toolchain.json` owns Hugo's version now.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "bbking",
  "main": "./src/worker.js",
  "compatibility_date": "2026-04-21",
  "workers_dev": false,
  // Every version gets a <id>-bbking.<subdomain>.workers.dev URL; CI tests against these.
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
      "name": "bbking-staging",
      "workers_dev": false,
      "preview_urls": true,
      "vars": { "SITE_ENV": "staging" },
      "routes": [{ "pattern": "staging.bbking.net", "custom_domain": true }]
    }
  }
}
```

- [ ] **Step 5: Write the workflows and the Dependabot config**

`.github/workflows/pr.yml`:

```yaml
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
    uses: brianbking/site-pipeline/.github/workflows/site-pr.yml@v0.1.7
    with:
      host: bbking.net
      worker: bbking
    secrets: inherit
```

`.github/workflows/deploy.yml`:

```yaml
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
    uses: brianbking/site-pipeline/.github/workflows/site-deploy.yml@v0.1.7
    with:
      environment: ${{ github.ref_name == 'main' && 'production' || 'staging' }}
      host: bbking.net
      worker: bbking
      smoke-pages: '["/", "/llms.txt", "/.well-known/agent-card.json"]'
    secrets: inherit
```

`.github/workflows/weekly.yml`:

```yaml
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
    uses: brianbking/site-pipeline/.github/workflows/site-weekly.yml@v0.1.7
    with:
      host: bbking.net
```

`.github/dependabot.yml`:

```yaml
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
```

Check that the three pins agree: `Select-String -Path .github\workflows\*.yml -Pattern 'site-pipeline/.+@(v[\d.]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object -Unique` prints exactly `v0.1.7`.

- [ ] **Step 6: Remove the Pages-era files**

```powershell
git rm -r -- functions static/_routes.json build.sh
```

- [ ] **Step 7: Update `.gitignore` and the docs**

Append to `.gitignore` (`*.url` is already there):

```
.wrangler/
.site-pipeline/
gate-out/
```

In `CLAUDE.md`:
- Replace "Hugo static site hosted on Cloudflare Pages, with a Pages Functions middleware layer." with "Hugo static site served by the Cloudflare Worker `bbking`, using the shared `site-pipeline` Worker."
- Replace "Cloudflare Pages builds from source on every push to `main`." with "GitHub Actions builds from source."
- Replace the whole `## Deployment` section body with: "PR into `staging` → preview URL and checks (`site-gate`) → merge → staging.bbking.net (Access login) → PR `staging` → `main` → production. GitHub Actions deploys via `brianbking/site-pipeline`; see its README. Hugo's version is pinned in site-pipeline's `toolchain.json`."
- Rename `## Cloudflare Pages` to `## Cloudflare`. Replace its `functions/_middleware.js` bullet with "`src/worker.js` — re-exports the shared Worker (markdown negotiation, `Link` alternate, staging `noindex`) from `@kingfamily/site-worker`". In the `_headers` bullet, change "(CSP, HSTS, `Vary`, AI content signals)" to "(CSP, HSTS, `Vary`, AI content signals, cache rules)".
- Leave the `/update-cdn-deps` line alone; it's out of scope.

In `README.md`:
- Line 3: replace "built with Hugo and hosted on Cloudflare Pages." with "Built with Hugo and served by a Cloudflare Worker." (the sentence now starts after a period, so capitalise "Built").
- `Hosting` row → `[Cloudflare Workers](https://developers.cloudflare.com/workers/) static assets`; `Middleware` row → `Shared Worker from brianbking/site-pipeline`.
- Replace "Cloudflare Pages builds from source on deploy" with "GitHub Actions builds from source on deploy".
- Replace the `## Deployment` body with: "GitHub Actions builds and deploys through [site-pipeline](https://github.com/brianbking/site-pipeline): PRs into `staging` get a preview URL and checks, `staging` deploys to staging.bbking.net, and `main` deploys to production. Hugo's version is pinned in site-pipeline's `toolchain.json`."
- In the structure tree, replace `├── functions/          # Cloudflare Pages Functions (middleware)` with `├── src/worker.js       # Re-exports the shared site Worker`, and move it below `content/` to match W3BBK's order.

Then check: `Select-String -Path CLAUDE.md,README.md -Pattern 'Pages|functions/|build.sh|wrangler.toml'` returns nothing.

- [ ] **Step 8: Verify locally**

Run each separately:

```powershell
npm run build
node ..\site-pipeline\checks\cli.mjs offline --dir public --host bbking.net; "exit=$LASTEXITCODE"
npx wrangler deploy --dry-run --env="" --outdir $env:TEMP\bb-dry
npx wrangler deploy --dry-run --env staging --outdir $env:TEMP\bb-dry-stg
```
Expected: `PASS offline checks` and `exit=0` (the same checks passed against the pre-conversion build on 2026-09-23). Both dry runs end with `--dry-run: exiting now.` and no `Multiple environments` warning. The staging run lists `env.SITE_ENV ("staging")`.

Start both dev servers (Bash tool, `run_in_background`, one command each):

```bash
cd P:/Family_Websites/BBKing.net && npx wrangler dev --env="" --port 8787
cd P:/Family_Websites/BBKing.net && npx wrangler dev --env staging --port 8788 --inspector-port 9230 --persist-to .wrangler/state-staging
```
The `--persist-to` is required: two instances deadlock on `.wrangler/state` with `SQLITE_BUSY` (pilot finding). Then:

```powershell
node ..\site-pipeline\checks\cli.mjs smoke --base http://127.0.0.1:8787 --pages '["/", "/llms.txt", "/.well-known/agent-card.json"]'; "exit=$LASTEXITCODE"
node ..\site-pipeline\checks\cli.mjs smoke --base http://127.0.0.1:8788 --staging; "exit=$LASTEXITCODE"
node ..\site-pipeline\checks\cli.mjs negotiate --base http://127.0.0.1:8787; "exit=$LASTEXITCODE"
```
Expected: `PASS smoke (production)`, `PASS smoke (staging)`, and a negotiation pass, each with `exit=0`. Stop both servers, then confirm `Get-NetTCPConnection -LocalPort 8787,8788 -State Listen -ErrorAction SilentlyContinue` returns nothing.

- [ ] **Step 9: Commit**

```powershell
git add -- package.json package-lock.json src/worker.js wrangler.jsonc .github/workflows/pr.yml .github/workflows/deploy.yml .github/workflows/weekly.yml .github/dependabot.yml .gitignore CLAUDE.md README.md
git status --short   # expect only the files above, plus the staged deletions from Step 6
git commit -m "feat: deploy via site-pipeline on Workers"
```
The pre-commit hook runs here for the first time in this repo. If it flags something Claude can't explain, that's a BLOCKED report. Don't use `--no-verify`.

### Task 3: Accounts and dashboard setup — Brian, with Claude guiding

Each item is Brian's action. Claude verifies each one where a command can.

- [ ] **Step 1: Branches.** Ask Brian whether to delete the merged `origin/development`. If yes, *Brian runs* `git push origin --delete development`. Then *Brian runs* `git -C P:\Family_Websites\BBKing.net push origin main:staging`. Verify: `gh api repos/brianbking/BBKing/branches --jq '.[].name'` lists `staging`.

- [ ] **Step 2: Label and Actions permissions** (Claude may run these after Brian's go):

```powershell
gh label create approved-visual-change --repo brianbking/BBKing --color FBCA04 --description "Accept this PR's visual diff"
gh api -X PUT repos/brianbking/BBKing/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

- [ ] **Step 3: Repo secrets.** Reuse the King Family token from wave 1 (the spec allows one token per Cloudflare account). The pilot plan said `op://Personal/...`, but the handoff records the real vault as **"King Family - Brian"**. First, Brian confirms the item's name and field labels, which prints no secret values: `op item get site-pipeline-king-family --vault "King Family - Brian" --format json | ConvertFrom-Json | Select-Object -ExpandProperty fields | Select-Object label`. The labels must include `credential` and `account_id`. Claude then writes this script to `$env:TEMP\Set-BBKingSecrets.ps1`, and *Brian runs* `powershell -NoProfile -File $env:TEMP\Set-BBKingSecrets.ps1`:

```powershell
#Requires -Version 5.1
# One-off: copy the King Family Cloudflare token + account ID into BBKing's Actions and Dependabot secrets.
param(
    [string]$Repo  = 'brianbking/BBKing',
    [string]$Vault = 'King Family - Brian',
    [string]$Item  = 'site-pipeline-king-family'
)
$ErrorActionPreference = 'Stop'
foreach ($app in 'actions', 'dependabot') {
    op read "op://$Vault/$Item/credential" | gh secret set CLOUDFLARE_API_TOKEN --app $app --repo $Repo
    if ($LASTEXITCODE -ne 0) { throw "CLOUDFLARE_API_TOKEN ($app) failed" }
    op read "op://$Vault/$Item/account_id" | gh secret set CLOUDFLARE_ACCOUNT_ID --app $app --repo $Repo
    if ($LASTEXITCODE -ne 0) { throw "CLOUDFLARE_ACCOUNT_ID ($app) failed" }
}
'Set 2 secrets x 2 apps on ' + $Repo
```
**Not yet run:** whether an `op://` reference accepts a vault name containing spaces. If `op read` rejects it, pass the vault's ID instead (`op vault list` shows it) as `-Vault <id>`.
Verify: `gh secret list --app actions --repo brianbking/BBKing` and `gh secret list --app dependabot --repo brianbking/BBKing` each list `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

- [ ] **Step 4: Bootstrap the staging Worker and its domain.** One-time, because `versions upload` needs the Worker to exist. On `feature/workers-ci`: `npm run build`, then `npx wrangler deploy --env staging`.
Expected: `bbking-staging` deployed, with `staging.bbking.net (custom domain)` listed.

- [ ] **Step 5: Preview URLs toggle on the production Worker.** Go to the dashboard → Workers & Pages → `bbking` → Settings → Domains & Routes → Preview URLs → Enable. `versions upload` does not apply `preview_urls` from config (pilot finding 3).
Verify from the branch: `npx wrangler versions upload --env=""`. The output must include a `Version Preview URL:` line. This upload is not deployed; it doesn't change production.

- [ ] **Step 6: Cloudflare Access for staging.** Go to Zero Trust → Access → Applications → Add → Self-hosted. Domain: `staging.bbking.net`. Policy: *Allow*, Include *Emails* = Brian's address.

- [ ] **Step 7: Verify the Access redirect by hand.** CI can't check it (spec Revisions → Access).

```powershell
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36" https://staging.bbking.net/
```
Expected: `302 https://<team>.cloudflareaccess.com/...`. A `200` means staging is public: stop and fix the Access application before going on.

- [ ] **Step 8: Leave the Workers Builds Git connection ON.** It keeps deploying `main` until the cutover in Task 5.

### Task 4: First PR through the pipeline

- [ ] **Step 1: Push and open the PR into `staging`.** *Brian runs* `git -C P:\Family_Websites\BBKing.net push -u origin feature/workers-ci`. Then Claude runs:

```powershell
gh pr create --repo brianbking/BBKing --base staging --head feature/workers-ci --title "feat: deploy via site-pipeline on Workers" --body "Wave 2 of site-pipeline (v0.1.7)."
gh run watch --repo brianbking/BBKing --exit-status
```

- [ ] **Step 2: Check the run against what was asked.** Read the `site-gate` PR comment. Every row should be green:
  - **Lighthouse:** A11y ≥ 95 (Task 1). BP and SEO must not be below production: production is served by the old assets-only Worker, so both scores should match. Perf must be within 10 points of production.
  - **Visual:** the footer opacity change is 0.6 → 0.7. The pilot measured the same change as 0.000 % under pixelmatch `threshold: 0.1`. If visual goes red anyway, open the `visual-diffs` artifact. A diff confined to the footer text is the intended fix and gets the `approved-visual-change` label, but only after Brian looks at it. Treat any other visible difference as a regression and investigate it with `/systematic-debugging`.
  - **Preview parse error:** go back to Task 3 Step 5.

- [ ] **Step 3: Fix each red check at its source,** in site-pipeline if the shared code is wrong or in BBKing if the site is. Don't loosen a threshold. A site-pipeline fix means a new patch tag, and moving all four pins (three workflows plus `package.json`) in one commit.

### Task 5: Cutover and exit criteria — ask Brian before each merge

- [ ] **Step 1: Merge into `staging`** (go-ahead first): `gh pr merge --repo brianbking/BBKing --merge feature/workers-ci`, then `gh run watch --repo brianbking/BBKing --exit-status`.
Expected: the `deploy` run on `staging` succeeds, with smoke on the version preview, then promotion, then the `deployments status` assertion.

- [ ] **Step 2: Disconnect Workers Builds** right before the production merge: dashboard → `bbking` → Settings → Build → disconnect the Git repository. (Review Focus 4 explains why now and not earlier.)

- [ ] **Step 3: Promote to production** (go-ahead first):

```powershell
gh pr create --repo brianbking/BBKing --base main --head staging --title "chore: promote staging to production" --body "Wave 2 cutover."
gh run watch --repo brianbking/BBKing --exit-status        # site-gate on the promotion PR
gh pr merge --repo brianbking/BBKing --merge staging
gh run watch --repo brianbking/BBKing --exit-status        # production deploy
```

- [ ] **Step 4: Verify production by hand** with curl, which the zone lets through:

```powershell
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
curl.exe -s -D - -o NUL -A $ua -H "Accept: text/markdown" https://bbking.net/ | Select-String -Pattern '^(HTTP|content-type|x-markdown-tokens|vary)'
curl.exe -s -D - -o NUL -A $ua https://bbking.net/ | Select-String -Pattern '^(HTTP|link|x-robots-tag)'
```
Expected for the markdown request: `HTTP/1.1 200`, `content-type: text/markdown; charset=utf-8`, a numeric `x-markdown-tokens`, and `vary: Accept`. The HTML response's `link` includes `<https://bbking.net/index.md>; rel="alternate"; type="text/markdown"`, and `x-robots-tag` is `noai, noimageai` with no `noindex`.

- [ ] **Step 5: Exercise the paths not yet run**
  - The Dependabot staging dispatch: `gh workflow run deploy.yml --repo brianbking/BBKing --ref staging`, then `gh run watch`. Expected: success.
  - Weekly: `gh workflow run weekly.yml --repo brianbking/BBKing`, then `gh run watch`. Expected: success with no new issue.
  - Rollback target exists: `npx wrangler deployments list --env=""` shows the new version and the earlier Workers Builds versions. Don't trigger a rollback on purpose.

- [ ] **Step 6: Wave 2 exit criteria.** Wave 2 is done when all of these hold:
  - One real PR went green through every gate.
  - The production deploy passed smoke and the `deployments status` assertion.
  - Negotiation is verified live (Step 4).
  - One weekly run is green.

  Then append a `## Wave 2 — BBKing.net (YYYY-MM-DD)` section to `.agents/findings/2026-09-23-w3bbk-pilot.md`. Record anything that differed from the pilot, plus the Actions minutes used so far this month (GitHub → Settings → Billing → Usage, `brianbking`). The spec says to re-measure its ~700/month estimate after wave 2. Commit it in site-pipeline with `docs: record wave 2 findings`.

### Task 6: Tag site-pipeline v1.0.0 — ask Brian first

The spec's Rollout section says to tag `v1.0.0` after wave 2; later waves change configuration only.

- [ ] **Step 1: Confirm nothing unreleased changes behaviour.** Run `git -C P:\Family_Websites\site-pipeline log --oneline v0.1.7..main -- worker checks .github toolchain.json package.json`.
Expected: empty (only `.agents/` / `.gitignore` commits since `v0.1.7`, checked 2026-09-23). If a Task 4 fix produced a newer patch tag, use that tag as the base instead.

- [ ] **Step 2: Tag** (go-ahead first). Claude runs `git -C P:\Family_Websites\site-pipeline tag -a v1.0.0 -m "v1.0.0: pipeline stable after waves 1-2"`. *Brian runs* `git -C P:\Family_Websites\site-pipeline push origin main v1.0.0`. Then Claude runs `gh run watch --repo brianbking/site-pipeline --exit-status` (ci on `main`). Expected: green.

- [ ] **Step 3: Let Dependabot move both sites.** A major bump is not grouped, so W3BBK and BBKing each get their own `v1.0.0` PR into `staging` at the next weekly run. To get it sooner, use the repo's Insights → Dependency graph → Dependabot → "Check for updates" (a dashboard action; there's no CLI route). Each PR auto-merges on a green `site-gate`. Dependabot's `npm` updater bumps `package.json` in a separate PR, and until it merges `package.json` lags the workflow pin. CI ignores `package.json` (the workflow tag is the single pin); only local `wrangler dev` sees the difference. Promote `staging` → `main` by hand for each site, as in Task 5 Step 3.

- [ ] **Step 4: Update the backlog.** In `.agents/tasks/backlog.md`, move Wave 2 to **Completed** (`_Completed: YYYY-MM-DD_`) and add the `v1.0.0` release. Commit with `docs: mark wave 2 and v1.0.0 done`.

---

## Open decision (does not block this plan)

**Lighthouse BP/SEO absolute floor** (backlog, low priority): the relative gate can ratchet down across PRs merged on red. Brian decides whether to add `min(95, baseline)`. BBKing's local baseline (2026-09-23) is BP 100 and SEO 92; the SEO 92 comes from the accepted `robots.txt` Content-Signal finding, so a flat 95 floor would fail it.
