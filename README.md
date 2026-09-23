# site-pipeline

Shared Cloudflare Worker and GitHub Actions pipeline for the King family Hugo sites.
Design: `.agents/specs/2026-09-23-workers-ci-pipeline-design.md`.

## What a site repo needs

| File | Content |
|---|---|
| `src/worker.js` | `export { default } from "@kingfamily/site-worker";` |
| `package.json` | `"@kingfamily/site-worker": "git+https://github.com/brianbking/site-pipeline.git#vX.Y.Z"` (https, not `github:`: npm records `github:` as `git+ssh`, which runners cannot clone), `wrangler` as a dev dependency |
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
