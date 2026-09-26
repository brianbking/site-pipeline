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
| `site-pr.yml` | `host`, `worker`, `visual-pages`, `visual-mask`, `lighthouse-pages`, `private-pages` (JSON arrays) |
| `site-deploy.yml` | `environment` (`staging`/`production`), `host`, `worker`, `smoke-pages`, `private-pages` |
| `site-weekly.yml` | `host`, `link-exclude` (space-separated lychee regexes) |

Secrets (repo **and** Dependabot): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Formspree.** A site's form ID lives only in its own `config/_default/params.toml` (`formspreeId`).
`site-pr.yml` reads it with `hugo config` and fails the PR if a built form posts anywhere else, the
action is malformed, `email`/`message` are not required, or a CSP `form-action` blocks Formspree.
`site-weekly.yml` sends one real submission (subject `[CI canary] <host>`) to each ID found in the
built forms. A form with reCAPTCHA on refuses that post ("Please complete the reCAPTCHA"), which
still counts as a pass: it proves the form exists and is enabled. Sites without a form skip both.

**Private paths.** A path a zone Access app gates in production (e.g. `/resume`) must be listed in
the site's `wrangler.jsonc` as `PRIVATE_PATHS`, both in `vars` and in `env.staging.vars`, because
wrangler does not inherit `vars` into environments. The Worker answers 404 for those paths on any
`*.workers.dev` host, since Access does not cover preview URLs. List the same paths, plus any file
under them, in the `private-pages` input of `pr.yml` and `deploy.yml`. The PR checks and the
pre-promotion smoke then prove the 404.

**Generated files.** A site that generates files after Hugo (the résumé PDF) defines an npm script
`build:pdf`. The PR and deploy builds run it after Hugo, and a failure fails the build. The offline
`pdf-links` check fails any build in which a same-site `.pdf` link has no file.

## Development

```bash
npm ci
npm test                                  # Worker + checks
node checks/cli.mjs offline --dir <site>/public --host <host>
```

Release: merge to `main`, then `git tag vX.Y.Z && git push origin vX.Y.Z`. Sites pick the tag up
through Dependabot.
