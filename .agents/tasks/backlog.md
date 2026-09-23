# site-pipeline — Backlog

> Tactical work queue. Items flow: Backlog → Planned → In Development → Completed.
> /writing-plans moves items into Planned. /handoff moves them through to Completed.

_Updated: 2026-09-23_

---

## In Development

---

## Planned

- [ ] **Phase 0 + W3BBK.us pilot** — shared Worker, checks, reusable workflows; W3BBK on GitHub Actions → Workers — [plan](../plans/2026-09-23-site-pipeline-phase0-w3bbk-pilot.md)

---

## Backlog

### High Priority
- [ ] **Wave 2: BBKing.net** — config-only port of the pilot; tag `v1.0.0` after _(Source: spec rollout)_
- [ ] **Wave 3: KingFamily** — adds Formspree offline check + weekly canary _(Source: spec rollout)_
- [ ] **Wave 4: BrianBK.ing + JillK.ing** — adds résumé PDF build step; fix `_headers` `kingfamily.info` Links; delete stale `brianbking.pages.dev` _(Source: spec rollout)_
- [ ] **Wave 5: MasonBK.ing** — Pages → Workers in the M@sonBK.ing account; fix `robots.txt` sitemap host; decide `.md` for `/family/`, `/friends/` _(Source: spec rollout)_

### Medium Priority
- [ ] **Shared Formspree ID `mgeggkzw`** — confirm BrianBK.ing + KingFamily sharing one form is intended _(Source: spec open items)_

### Low Priority / Nice to Have
- [ ] **Contact-form name pattern** — `[A-Za-z\s]+` rejects hyphens, apostrophes, accents _(Source: spec open items)_
- [ ] **`run_worker_first` route list** — exclude static paths once pattern syntax is confirmed _(Source: plan minimal: marker)_
- [ ] **`_headers` Cache-Control doubling** — `/*` and `/css/*` both apply, emitting `public, max-age=0, must-revalidate, public, max-age=3600` _(Source: pilot wrangler dev, 2026-09-23)_

---

## Completed
