# Lapso

A single-page, offline-capable fasting timer. One fast at a time. No backend, no accounts, no analytics.

- `SPEC.md` — build specification (behaviour, look, guardrails, acceptance tests)
- `PLAN.md` — implementation plan (resolved decisions, gated phases, invariant enforcement)
- `ISSUES.md` — open issues and feature requests not yet folded into the plan

## Develop

```sh
npm install
npm run dev
```

## Verify

```sh
npm test
npm run build
```

## Workflow

Each feature/fix gets its own branch (`feature/<slug>`, `fix/<slug>`), opened
off `main` and merged back into `main` once it's done — no direct commits to
`main` for feature work.

## Versioning

`package.json`'s `version` follows `x.y.z`:

- `x` — release version, bumped on a deliberate release cut
- `y` — feature, bumped when a feature branch merges to `main`
- `z` — patch, bumped for a fix that isn't a new feature

This isn't strict SemVer (`x` doesn't track breaking changes) — it just says
what kind of change most recently landed.
