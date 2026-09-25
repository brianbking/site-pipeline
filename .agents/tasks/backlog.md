# site-pipeline — Backlog

> Tactical work queue. Items flow: Backlog → Planned → In Development → Completed.
> /writing-plans moves items into Planned. /handoff moves them through to Completed.

_Updated: 2026-09-23 (after pilot)_

---

## In Development

---

## Planned

- [ ] **Wave 4: BrianBK.ing + JillK.ing + site-pipeline v1.2.0** — `PRIVATE_PATHS` (résumé 404 on previews), `build:pdf` + `pdf-links`, a11y fixes, contact subject host, `_headers` Links; delete stale `brianbking.pages.dev` — [plan](../plans/2026-09-25-site-pipeline-wave4-brianbking-jillking.md) _(Source: spec rollout)_

---

## Backlog

### High Priority
- [ ] **Wave 5: MasonBK.ing** — Pages → Workers in the M@sonBK.ing account; fix `robots.txt` sitemap host; decide `.md` for `/family/`, `/friends/` _(Source: spec rollout)_

### Medium Priority
- [ ] **Fingerprint site CSS/JS for browser-cache busting** — `styles.css` has a fixed `targetPath` (no `| fingerprint`), and `_headers` gives `/css/*` and `/js/*` `max-age=3600` (images 7 days), so returning visitors can pair new HTML with stale CSS for up to an hour after a deploy. Add `| fingerprint` in each site's `layouts/partials/head/stylesheets.html` (and local JS), then raise those `_headers` rules to long-lived/`immutable`. Needs a baseline-aware rollout: the visual gate compares against production. All sites (W3BBK, BBKing, KingFamily; fold into waves 4–5). The Cloudflare edge needs no purge: verified 2026-09-24, new build served immediately despite `CF-Cache-Status: HIT` _(Source: cache question after wave 3)_
- [ ] **KingFamily referral links** — weekly link check (issue brianbking/KingFamily#3): Chase referral `referyourchasecard.com/252n/X70AE3Z8MY` 404 (dead); 23andMe + The North Face 403 (likely bot-blocking runners — verify in a browser, then fix or add to the site's `link-exclude`) _(Source: wave 3 first weekly run)_
- [ ] **Relative asset URLs in the sites** — absolute `https://<host>/js/scripts.js` is CSP-blocked on preview origins, distorting visual (BBKing heading shadow) and BP baselines; every PR against the stale baseline needs `approved-visual-change` _(Source: wave 2 findings)_
- [ ] **Secrets snippet for waves 3–5** — use `gh secret set NAME --body (op read …).Trim()`; piping under PS 5.1 stores a trailing CRLF _(Source: wave 2 findings)_

### Low Priority / Nice to Have
- [ ] **Lighthouse BP/SEO floor** — relative gate can ratchet down across merged-on-red PRs; consider `min(95, baseline)` floor or a warning _(Source: pilot final review I4, Brian to decide)_
- [ ] **Review minors** — import STAGING_ROBOTS from the Worker; rollback when promote fails after applying; check package.json tag = workflow pin; exclude family subdomains in link check; fix stale site-weekly comment; pin third-party actions by SHA; toolchain-bump version validation; .well-known smoke on PR preview; Link alternate keeps query string _(Source: both reviews)_
- [ ] **Lighthouse Performance gate flakes on third-party-heavy pages** — KingFamily /referrals/ went 69/73/62 vs baseline 71/71/74 across runs; local Lighthouse showed 6-11 s stalls where every in-flight CDN/Google Fonts request finishes together, reproduced with no Worker in front. Median of 3 is not enough; consider more runs, interleaving baseline/candidate, or judging on LCP/TBT _(Source: wave 3 PR #1)_
- [ ] **Visual threshold** — pixelmatch 0.1 absorbed a footer opacity change; consider a lower threshold for colour-sensitive pages _(Source: pilot findings)_
- [ ] **Identify the zone bot-challenge feature** — Security → Events _(Source: pilot findings Q1)_
- [ ] **Contact-form dead client code** — `contact-form.js` targets `#myForm` (form is `#fs-frm`) so Submit throws; reCAPTCHA script CSP-blocked with no widget (KingFamily, likely BrianBK.ing/JillK.ing) _(Source: wave 3 planning)_
- [ ] **Contact-form name pattern** — `[A-Za-z\s]+` rejects hyphens, apostrophes, accents _(Source: spec open items)_
- [ ] **`run_worker_first` route list** — exclude static paths once pattern syntax is confirmed _(Source: plan minimal: marker)_
- [ ] **`_headers` Cache-Control doubling** — `/*` and `/css/*` both apply, emitting `public, max-age=0, must-revalidate, public, max-age=3600` _(Source: pilot wrangler dev, 2026-09-23)_

---

## Completed

- [x] **Wave 3: KingFamily + site-pipeline v1.1.0/v1.1.1** — kingfamily.info on Actions → Workers, serves markdown; Formspree offline check + weekly canary (reCAPTCHA refusal = liveness); a11y 100; Dependabot alerts 16 → 0 — _Completed: 2026-09-24_ — [plan](../plans/2026-09-23-site-pipeline-wave3-kingfamily.md), [findings](../findings/2026-09-23-w3bbk-pilot.md)
- [x] **Shared Formspree ID `mgeggkzw`** — intentional: BrianBK.ing + KingFamily route to the same address; may diverge later via each site's `params.toml` — _Completed: 2026-09-23_
- [x] **Wave 2: BBKing.net + site-pipeline v1.0.0** — bbking.net on Actions → Workers, serves markdown; staging behind Access; `v1.0.0` tagged — _Completed: 2026-09-23_ — [plan](../plans/2026-09-23-site-pipeline-wave2-bbking.md), [findings](../findings/2026-09-23-w3bbk-pilot.md#wave-2--bbkingnet-2026-09-23)

- [x] **Release v0.1.7 to W3BBK** — indexable check + deploy branch guard live in production — _Completed: 2026-09-23_
- [x] **Phase 0 + W3BBK.us pilot** — site-pipeline v0.1.0–v0.1.6 public; w3bbk.us deploys via Actions and serves markdown — _Completed: 2026-09-23_ — [plan](../plans/2026-09-23-site-pipeline-phase0-w3bbk-pilot.md), [findings](../findings/2026-09-23-w3bbk-pilot.md)
