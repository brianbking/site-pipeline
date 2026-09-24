# site-pipeline — Backlog

> Tactical work queue. Items flow: Backlog → Planned → In Development → Completed.
> /writing-plans moves items into Planned. /handoff moves them through to Completed.

_Updated: 2026-09-23 (after pilot)_

---

## In Development

---

## Planned


---

## Backlog

### High Priority
- [ ] **Wave 3: KingFamily** — adds Formspree offline check + weekly canary _(Source: spec rollout)_
- [ ] **Wave 4: BrianBK.ing + JillK.ing** — adds résumé PDF build step; fix `_headers` `kingfamily.info` Links; delete stale `brianbking.pages.dev` _(Source: spec rollout)_
- [ ] **Wave 5: MasonBK.ing** — Pages → Workers in the M@sonBK.ing account; fix `robots.txt` sitemap host; decide `.md` for `/family/`, `/friends/` _(Source: spec rollout)_

### Medium Priority
- [ ] **Relative asset URLs in the sites** — absolute `https://<host>/js/scripts.js` is CSP-blocked on preview origins, distorting visual (BBKing heading shadow) and BP baselines; every PR against the stale baseline needs `approved-visual-change` _(Source: wave 2 findings)_
- [ ] **Secrets snippet for waves 3–5** — use `gh secret set NAME --body (op read …).Trim()`; piping under PS 5.1 stores a trailing CRLF _(Source: wave 2 findings)_
- [ ] **Shared Formspree ID `mgeggkzw`** — confirm BrianBK.ing + KingFamily sharing one form is intended _(Source: spec open items)_

### Low Priority / Nice to Have
- [ ] **Lighthouse BP/SEO floor** — relative gate can ratchet down across merged-on-red PRs; consider `min(95, baseline)` floor or a warning _(Source: pilot final review I4, Brian to decide)_
- [ ] **Review minors** — import STAGING_ROBOTS from the Worker; rollback when promote fails after applying; check package.json tag = workflow pin; exclude family subdomains in link check; fix stale site-weekly comment; pin third-party actions by SHA; toolchain-bump version validation; .well-known smoke on PR preview; Link alternate keeps query string _(Source: both reviews)_
- [ ] **Visual threshold** — pixelmatch 0.1 absorbed a footer opacity change; consider a lower threshold for colour-sensitive pages _(Source: pilot findings)_
- [ ] **Identify the zone bot-challenge feature** — Security → Events _(Source: pilot findings Q1)_
- [ ] **Contact-form name pattern** — `[A-Za-z\s]+` rejects hyphens, apostrophes, accents _(Source: spec open items)_
- [ ] **`run_worker_first` route list** — exclude static paths once pattern syntax is confirmed _(Source: plan minimal: marker)_
- [ ] **`_headers` Cache-Control doubling** — `/*` and `/css/*` both apply, emitting `public, max-age=0, must-revalidate, public, max-age=3600` _(Source: pilot wrangler dev, 2026-09-23)_

---

## Completed

- [x] **Wave 2: BBKing.net + site-pipeline v1.0.0** — bbking.net on Actions → Workers, serves markdown; staging behind Access; `v1.0.0` tagged — _Completed: 2026-09-23_ — [plan](../plans/2026-09-23-site-pipeline-wave2-bbking.md), [findings](../findings/2026-09-23-w3bbk-pilot.md#wave-2--bbkingnet-2026-09-23)

- [x] **Release v0.1.7 to W3BBK** — indexable check + deploy branch guard live in production — _Completed: 2026-09-23_
- [x] **Phase 0 + W3BBK.us pilot** — site-pipeline v0.1.0–v0.1.6 public; w3bbk.us deploys via Actions and serves markdown — _Completed: 2026-09-23_ — [plan](../plans/2026-09-23-site-pipeline-phase0-w3bbk-pilot.md), [findings](../findings/2026-09-23-w3bbk-pilot.md)
