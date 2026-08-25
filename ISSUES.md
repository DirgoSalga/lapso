# Lapso — Open Issues & Feature Requests

Tracks feature requests and open issues that aren't yet part of `SPEC.md` / `PLAN.md`. Once a request is scoped and scheduled, move it into `PLAN.md` as a phase/task and mark it done here (or remove it).

Status legend: `open` (not started) · `in progress` · `done`

---

## Epics

### A. Self-contained Docker image, published via GitHub → pull-to-deploy

**Status:** done — merged to `main` in `v1.0.0`, GitHub Actions run [#1](https://github.com/DirgoSalga/lapso/actions/runs/32687701170) built and published `ghcr.io/dirgosalga/lapso:latest`, and `ds-hetz-bird-01` is now running that image in production. lapso.cloud.dirgosalga.com verified live and serving the same nginx caching rules as before, from the image instead of a bind mount.
**Requested by:** Diego, 2026-08-23

Package the app and the web server together as a single Docker image, built and published from GitHub, so redeploying is `docker compose pull && docker compose up -d` on the host instead of the current local-build-and-`rsync` flow (see `deploy/README.md`). Also sets up a natural place to later attach a database/backend service alongside the app container.

**Current state (baseline this epic changes):** no `Dockerfile` in the repo yet; `deploy/docker-compose.yml` runs stock `nginx:alpine` and bind-mounts a locally-built `dist/` and `deploy/nginx.conf` from the host — the image itself has no app code baked in, and there's no GitHub Actions workflow or container registry involved today. No git remote is configured on this local repo yet either, so pushing to GitHub is itself a prerequisite step, not assumed.

**Sub-tasks:**

- [x] Push this repo to a GitHub remote — done earlier this session (`git@github.com:DirgoSalga/lapso.git`).
- [x] Write a multi-stage `Dockerfile`: `node:22-alpine` build stage (`npm ci && npm run build`), `nginx:alpine` runtime stage that `COPY`s `dist/` and `deploy/nginx.conf` in — no host bind-mounts for app content. Added `.dockerignore` alongside it.
- [x] GitHub Actions workflow (`.github/workflows/docker-publish.yml`): builds on push to `main`, on `vX.Y.Z` tags, and manually (`workflow_dispatch`); pushes to `ghcr.io/dirgosalga/lapso` tagged `latest` (on `main`), `X.Y.Z` (on a matching git tag), and `sha-<short-sha>` (always, for rollback).
- [x] Decided: GHCR package made **public** (no secrets in a static fasting timer, avoids needing a PAT on the host). Turned out no manual step was needed — after the first workflow run, an anonymous `ghcr.io/token` pull check confirmed `ghcr.io/dirgosalga/lapso:latest` is already publicly pullable (verified via the registry API directly, not just the GitHub UI).
- [x] Updated `deploy/docker-compose.yml` to `image: ghcr.io/dirgosalga/lapso:latest`, dropped the `volumes:` bind mounts; Traefik labels untouched.
- [x] Rewrote `deploy/README.md`: new layout (no `nginx.conf` on the host anymore), publish/tagging docs, `docker compose pull && docker compose up -d` redeploy steps, and a rollback recipe (pin an older `sha-`/`X.Y.Z` tag).
- [x] Out of scope for now, kept the door open: no database/backend service added; `docker-compose.yml` still supports adding a second service on the same `proxy` network later without restructuring.

**Follow-up, not blocking:**
- The old synced `dist/` and `nginx.conf` copies are still sitting unused in `/home/ava/lapso/` on the host (harmless, just no longer referenced by `docker-compose.yml`) — fine to leave or clean up later.
- The `Dockerfile` was validated by the real GitHub Actions build, not a local build — local Docker still needs `sudo` in this environment (the `docker` group membership added mid-session doesn't apply to the running shell; needs a fresh session to pick up).

---

## Features

### 1. Show projected completion time

**Status:** done — merged to `main` in `v0.2.0` (`feature/completion-time`)
**Requested by:** Diego, 2026-08-23

Show the clock time the fast will complete (i.e. `startedAt`/entry time + goal duration), not just the elapsed duration.

- Display during duration entry, as the goal duration is being chosen (before the fast starts).
- Display during an active fast, near the top, next to/near the "fasting since HH:MM" eyebrow (see `SPEC.md` §5.4 layout).
- Needs to recompute if the goal duration is changed mid-fast (Settings) — should stay derived, not stored, per the spec's one invariant (`SPEC.md` §1: persist only `startedAt`).
- Implemented: `completesAt()` in `src/core/clock.ts`; wired into the idle duration-entry form ("Done around HH:MM") and the active-fast eyebrow ("fasting since HH:MM · done HH:MM") in `src/ui/Timer.tsx`.

### 2. Tap elapsed time to toggle to remaining time

**Status:** done — merged to `main` in `v0.3.0` (`feature/tap-remaining-time`)
**Requested by:** Diego, 2026-08-23

During an active fast, tapping/clicking the big timer readout (currently elapsed time, e.g. `14:22:07`) toggles it to show remaining time until goal instead (and back on a second tap).

- Applies to the main timer numerals inside the ring (`SPEC.md` §5.4 layout, §5.5 ring).
- Consider whether the toggle state should persist across reloads/sessions or always reset to "elapsed" — decided: does not persist. Resets to elapsed whenever a fast starts or ends (in-memory React state only, nothing written to storage).
- Does not affect the ring's progress arc or overtime ring, only the numeral readout.
- Implemented: `.readout-time` is now a real `<button>` (was a `<div>`) for tap/click + keyboard access, with an `aria-label` announcing which mode is showing. Remaining time is `max(0, goalMs - elapsedMs)`, clamped at zero past goal (same clamp `formatElapsedClock`/`formatDuration` already use elsewhere).

### 3. Confetti when the goal is reached

**Status:** done — merged to `main` in `v1.1.0` (`feature/goal-confetti`), confirmed working by Diego on the dev server
**Requested by:** Diego, 2026-08-24

When a fast crosses its goal, show small colourful confetti falling over the background, to symbolize and celebrate the success. Keeps falling for the whole overtime phase, not a brief burst — stops when the fast ends.

- Tied directly to phase state (`readout.phase === 'overtime'` in `Timer.tsx`), not a one-off timer on the crossing edge — first attempt used a 3s `setTimeout` burst, which didn't match what was actually wanted (confirmed with Diego 2026-08-24: "keep seeing the confetti... until the fast ends"). Being phase-bound rather than edge-triggered also means it shows immediately if the app is reopened while already in overtime, not just on a live crossing.
- The ring's goal swell/vibrate stayed a one-off pulse on the fasting→overtime edge — only confetti's lifetime changed.
- Respects the app's existing reduced-motion gate (`settings.reduceMotion === 'always'` or OS `prefers-reduced-motion`) — skipped entirely under reduced motion, same as the swell.
- Non-interactive (`pointer-events: none`, `aria-hidden`) and CSS-animation driven (`animation-iteration-count: infinite`, no canvas, no per-frame JS loop) so it stays cheap no matter how long overtime runs.

### 4. Glowing edge on a card around the whole active-fast screen

**Status:** done — merged to `main` in `v1.2.0` (`feature/ring-card-glow`), confirmed working by Diego on the dev server
**Requested by:** Diego, 2026-08-25

Add a glowing edge to a card, matching a reference design Diego provided (2026-08-25): a shadcn/Tailwind "Shine Border" component (`magicui`-style — animated masked radial-gradient border). First pass wrapped only the ring; corrected same-day per Diego's feedback — the card wraps the **whole active-fast UI** (eyebrow, banners, ring, End fast button, recent fasts), not just the ring. Portrait shape, following naturally from the stacked content rather than a fixed aspect-ratio.

- **The reference was a shadcn/Tailwind/Next.js component; this project is none of those** (Vite SPA, hand-rolled CSS on OKLCH tokens, no Tailwind/shadcn/`components.json`, `next-themes` doesn't even apply since there's no Next.js). `SPEC.md`'s runtime dep budget caps at ≤3 (`react`, `react-dom`; see `PLAN.md` §1.C) specifically to avoid exactly this kind of dependency pull-in. Rather than scaffold Tailwind/shadcn for one visual effect, ported just the underlying *technique* into plain CSS: `src/styles/app.css`'s `.fast-card::before` uses the same trick the reference did (a radial-gradient painted across an oversized `background-size`, masked down to a thin border-width band via `mask-composite: exclude`, animated by sliding `background-position`) with zero new dependencies.
- New `.fast-card` wraps the active-fast branch's JSX in `src/ui/Timer.tsx` (everything from the eyebrow block down through `<RecentFasts>`); `.timer-ring-wrap` itself went back to being a plain positioning wrapper, unrelated to the card now. `.fast-card` picked up `.shell`'s `display:flex; flex-direction:column; align-items:center` so its children (which already carried their own `max-width:320px`/margins) keep the exact same layout, just one level deeper.
- Fill: first pass left it fully transparent, reasoning the page's own progress-driven background wash (spec §5.2) already carried colour here. Revised once the dot backdrop below was added (2026-08-25) — a transparent card let the dots show straight through the content, and "make [the card] more distinct" needs the card to actually read as a distinct surface. Now `background: color-mix(in oklch, var(--surface) 88%, transparent)` — translucent enough to still let a hint of the body wash through, opaque enough to read as a card and cleanly sit over the backdrop.
- **Backdrop (2026-08-25, Diego: "add some element to background behind the card to make more distinct"):** a second reference, a shadcn/Tailwind "Dot Background" component — same not-actually-Tailwind rationale as above. Ported as `.fast-backdrop` (`src/ui/Timer.tsx`, styled in `app.css`): a fixed, full-viewport dot grid (`radial-gradient` dots on a 20px grid, colour `var(--slate)`) radially masked so the dots fade out near the centre (roughly behind the card) and fade in toward the edges — the card reads as distinct from a textured surround instead of sitting on a flat wash. `aria-hidden`, `pointer-events: none`, only rendered in the active-fast branch (same scope as the card itself).
- Colours: reference used an arbitrary purple/pink/orange trio; re-picked to the app's own tokens. Diego asked (2026-08-25) whether the colour could change — after weighing a static token vs. tracking the ring's own live colour, went with **dynamic**: one gradient stop is `--fast-card-glow`, a CSS custom property `Timer.tsx`'s `frame()` writes every frame to `ringColor(progress)` (the same function `Ring.tsx` uses for the arc itself), so the glow visually tracks fast progress — cold blue early, warming to gold/ember near and past goal — the same way the ring does, rather than staying a fixed hue. `--ember` anchors the gradient's other stop as the hot end; `var(--fast-card-glow, var(--glow))` falls back to the static token before the first frame writes it.
- Runs continuously whenever `.fast-card` is rendered, i.e. for the whole active fast (both fasting and overtime phases) — no JS trigger needed, since that markup is already only mounted while a fast is active.
- Reduced motion: the gradient/mask render unconditionally (so the card still shows a static coloured edge), but the sliding `background-position` animation is gated behind `@media (prefers-reduced-motion: no-preference)`, matching the existing swell/confetti convention *and* mirroring what the reference's own `motion-safe:` Tailwind variant did.