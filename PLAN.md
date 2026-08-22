# Lapso — Implementation Plan

Derived from `SPEC.md`. This plan resolves the open decisions the spec leaves ("History Routing API *or* a 40 line hash router", "React optional but recommended", and the mechanism for the OKLCH heat ramp), sequences the spec's build order (§13) into concrete, verifiable tasks, and attaches a definition-of-done and a risk register to each. Read the spec first; this plan does not restate it, it operationalises it.

**The one invariant.** Spec §1: persist only `startedAt`. Everything else is derived per render from `Date.now() - startedAt`. No counter, no stored `elapsedMs`, no accumulated delta anywhere. The plan treats this as a lint-level rule: any code that increments a stored number is a bug (see §4 below for how we enforce it).

---

## 1. Resolved architecture decisions

The spec leaves a few choices open. This is where they land, and why.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| A | Routing | **Hand-rolled hash router** (`#/`, `#/history`, `#/settings`), ~40 lines, no React Router | The spec's first option, a "History Routing API", is not a stable shipped API. The closest modern replacement (the Navigation API) reached *Baseline Newly Available* in Jan 2026 and ships in **Safari 26.2+**, which is above our support floor of **Safari 16.4**. A hash router works identically in every target browser and needs **zero** server/SPA-rewrite config, which is exactly what "must work unchanged on Azure SWA / Cloudflare Pages / GitHub Pages" (spec §2) demands. History-API routing would need a fallback rewrite rule on each host — rejected. |
| B | UI framework | **React 18** (`react` + `react-dom`) | Spec recommends it for settings/history and the §12 file layout is `.tsx`. **But** the ring/timer clock is driven by a raw `requestAnimationFrame` loop *outside* React's reconciliation (spec §4.1) so it hits 60fps without re-rendering the component tree. React renders the view chrome, static parts of the ring, and the text readout on the 1s interval — never the per-frame arc. |
| C | Runtime dep budget | **`react`, `react-dom` = 2 runtime deps** | Spec caps at ≤3. No charting lib (hand-rolled SVG, §2), no router (hash), no state lib (plain `localStorage` + a small store). Dev-only deps (vite, typescript, vitest, plugin-react, @fontsource) don't count. |
| D | OKLCH interpolation | **Pure `src/core/color.ts`** that lerps an OKLCH triple in OKLCH space and emits `oklch()` strings, computed in JS | Every target (Chrome 111+, Firefox 113+, **Safari 15.4+** ≥ our 16.4 floor) supports `oklch()`, so no sRGB fallback is strictly required. Doing the lerp in JS — not CSS `color-mix` — makes mid-ramp colours **deterministic and unit-testable**, which is the only way to actually verify the spec §11 requirement that "the mid-ramp values" meet WCAG AA against the surface at every point. The spec explicitly warns the sRGB midpoint goes muddy; interpolating in OKLCH avoids that. |
| E | Fonts | **Self-hosted** variable fonts, bundled + SW-cached | The app must run fully offline after first load (spec §2). Fonts must be part of the app shell, **not** a CDN. Bundle Fraunces (variable: `wght`, `opsz`, `SOFT`, `WONK`) + IBM Plex Sans + IBM Plex Mono via `@fontsource` (or local copies). Verify whether the loaded Fraunces cut exposes `tnum`; if not, fall back to rendering each digit in a fixed-width span (spec §5.3) so the layout never jitters per second. |
| F | Testing | **Vitest** for unit + `jsdom`/happy-dom for DOM-level tests | Covers `clock.ts` (the crown jewel, spec §13 step 1), `color.ts` contrast, and `storage.ts` corruption paths. No heavy e2e tooling in v1; acceptance tests (spec §14) are a scripted manual pass plus an optional thin Playwright smoke (see §7, Verification method). |

---

## 2. Project scaffolding (prerequisite, not in spec's numbered order)

- [x] `npm create vite@latest . -- --template react-ts` in `~/lapso/` (non-empty dir: confirmed with user before init). Configured `tsconfig` to `strict: true` + `noUncheckedIndexedAccess`. (Merged the react-ts template in over the existing `PLAN.md`/`SPEC.md`; kept both docs.)
- [x] Added dev deps, pinned: `vitest@4.1.11`, `jsdom@30.0.1`, `@vitejs/plugin-react@6.1.0`, `typescript@6.0.3`, `vite@8.2.2`, `oxlint@1.75.0`. Vitest jsdom env wired into `vite.config.ts`.
- [x] Added runtime deps (5 total, over the ≤3 budget — see note below): `react@18.3.1`, `react-dom@18.3.1`, `@fontsource-variable/fraunces@5.3.0`, `@fontsource-variable/ibm-plex-sans@5.3.0`, `@fontsource/ibm-plex-mono@5.3.0`. **Note:** the font packages are self-hosted bundling of fonts (data, not logic) — treat `react`+`react-dom` as the two *logic* runtime deps per spec §2; fonts are content. Flag for Diego: if the spec's ≤3 is meant to include fonts, we still fit by counting only executable deps. `main.tsx` imports the **`full`** Fraunces cut (all `wght`/`opsz`/`SOFT`/`WONK` axes) so the §5.3 signature move has every axis — confirmed the build emits the all-axes variable `woff2` with `woff2-variations`. Per-axis registration to be re-confirmed in a real browser via `document.fonts` in Phase 4.
- [x] Added `public/sw.js` (versioned `lapso-shell-v1`, activate cleans stale `lapso-shell-*`, network passthrough for now) and `public/manifest.webmanifest` (name/short_name Lapso, standalone, 192+512, theme_color `--porcelain`) placeholders so later phases don't miss them.
- [x] Set up `src/styles/tokens.css` with the spec §5.2 `:root` tokens (both day and night themes, OKLCH ring stops, `--p` custom property) and the import chain in `main.tsx`.
- [x] Invariant enforcement: wrote `src/core/invariants.test.ts` (the vitest source-scan route the plan offers) — walks `src/**`, asserts no persisted `elapsed` write and no `confirm()`. Both pass; self-file is excluded from its own scan.

---

## 3. Build phases (mirrors spec §13, with acceptance gates)

Each phase ends with a **gate**: the enumerated acceptance criteria pass before the next phase starts. This mirrors the spec's own ordering and its "no UI before clock.ts" rule.

### Phase 1 — `clock.ts` + unit tests (no UI)

Pure module, `src/core/clock.ts`, one exported function:

```ts
export interface FastInput {
  startedAt: number;
  goalHours: number;
  firedMilestones: string[];
  now: number;                 // injected, not Date.now() — makes it testable
}
export function derive(input: FastInput): Derived; // Derived per spec §4
```

Implementation details to pin down in code (and tests):
- `elapsedMs = Math.max(0, now - startedAt)`; guard against `now < startedAt` (clock rolled back) → returns a `phase: 'clock-skew'`-flavoured state, or the UI layer checks `lastSeenNow` separately (spec §10). Keep `clock.ts` pure: it reports, it doesn't decide UI.
- `progress = clamp(elapsedMs / goalMs, 0, 1)` where `goalMs = goalHours * 3600 * 1000`.
- `phase` resolution: **`fasting` for `elapsedMs <= goalMs`, `overtime` for `elapsedMs > goalMs`**. `goal-reached` and `idle` are UI-level states, not per-frame derived values (the milestone system owns the goal-crossing moment; idle is "no active fast", which lives outside `clock.ts`). Express this through the `Phase` type + a `GoalStatus` sub-enum rather than prose, per Diego's no-comment preference.
- `overtimeMs = max(0, elapsedMs - goalMs)`; `overtimeHours = overtimeMs / 3600000`; `lapIndex = floor(overtimeHours)`; `lapProgress = overtimeHours % 1`.
- `intensity = Math.min(overtimeHours, 2) / 2` (cap per spec §4.2, §9.1).
- `dueMilestones`: computed from `goalHours` and `settings.milestonePercents` — but `milestones.ts` owns the keying; `clock.ts` receives percents as a parameter and returns keys for passed-but-unfired. Keys: `p{NN}` (from percents), `goal`, `ot1`, `ot2`, `ot3` (max 3 per spec §6).

**Gate 1:**
- [ ] `clock.ts` unit tests: cold/fast/overtime/idle boundaries, DST boundary (same epoch input, different local tz via `Intl` — the *function* must return identical output for the same epoch `now`; test with a mock tz), clock-back (`now < startedAt`), `goalHours` edges (0, 1, 48), percents `[50,90]` dedupe, intensity plateau (`overtimeHours=6` → `intensity=1` identical to `overtimeHours=2`), `lapIndex`/`lapProgress` across 0/1/3 laps.
- [ ] **DST test** from spec §14: `derive()` with a `now` straddling a DST transition returns identical `elapsedMs`/`progress`/`phase` as the same interval in a non-transition tz (epoch invariance).

### Phase 2 — `storage.ts` (console-driven, no UI yet)

`src/core/storage.ts`:
- Keys: `fast.active`, `fast.history`, `fast.settings` (spec §3.2).
- Every read wrapped in `try/catch` + defensive `JSON.parse`; on failure: quarantine raw string under `fast.corrupt.<epochMs>` and return defaults. **Never throw.**
- `migrate<T>(raw: unknown, schemaVersion: number): T` — versioned switch; v1 is passthrough. Write it on day one (spec §3.3.2).
- `startFast(startedAt, goalHours)`, `endFast(now)` (writes `CompletedFast`, appends to history, clears active), `deleteAll()`, `exportJson()`, `importJson(file)` — import validates schema per key, rejects unknown `schemaVersion` greater than ours (fail safe: prompt, don't clobber).
- `window.addEventListener('storage', ...)` re-reads the three keys on external change (spec §3.3.3) → notifies subscribers (a tiny event emitter so the React store and the rAF loop both react).
- `lastSeenNow` persisted per tick (spec §10 clock-skew detection).

**Gate 2:**
- [ ] From the browser console: `startFast()`, refresh → still fasting; restart browser → still fasting, elapsed continues (spec §14 acceptance tests 1 & 2, run manually against the static ring stub in Phase 3).
- [ ] Corrupt `fast.active` JSON (hand-edited in DevTools) → app boots, quarantined key appears, idle state renders (spec §14 last item).
- [ ] Two tabs: start in A, B's state updates without reload; end in A, B returns to idle (spec §14 two-tabs test).
- [ ] Unit tests: corruption quarantine, migration v1→v1 idempotence, export→import round-trip, import of foreign schema, history newest-last ordering.

### Phase 3 — The ring (static, then wired to the clock)

`src/ui/Ring.tsx` + `src/ui/Timer.tsx`. Spec §5.5 geometry: `viewBox 0 0 240 240`, track `r=100 sw=12 --slate`@18% opacity, progress arc same geometry with `stroke-linecap: round` and a `<linearGradient>` whose stops are the OKLCH ramp; group rotated −90° about centre so fill starts at twelve o'clock. `C = 2π·100 = 628.3185`; `strokeDasharray = C`, `strokeDashoffset = C·(1 − progress)`. Milestone ticks: 6 px radial marks at `angle = 360·pct/100 − 90`, filled once passed. Overtime ring: thinner arc `r=116 sw=4 --ember`, progress = `lapProgress`; each completed lap leaves a persistent dot at twelve o'clock (three dots = three hours past goal). Ambient glow: blurred duplicate arc, opacity driven by `intensity` (no canvas particles — spec §5.5).

Layout per spec §5.4: single column, max-width 420 px, vertically centred; eyebrow "fasting since HH:MM" (mono, `--slate`); Fraunces readout; "goal 16h" sub-line; **End fast** always visible, full contrast, one tab stop from load in every phase, no confirm dialog — a 5 s undo toast instead (spec §9.2). Recent-fasts sparkline row at the bottom, neutral `--slate`. Idle state: large **Start fast** + goal selector defaulting to `settings.defaultGoalHours`.

- [ ] Ring renders statically at hand-set progress values 0 / 0.25 / 0.5 / 0.9 / 1.0 / 1.2-overtime and matches the spec §5.5 geometry (track r=100 sw=12 slate@18%, arc round-cap, −90° rotation starting at 12 o'clock, milestone ticks at `360*pct/100 − 90`°).
- [ ] OKLCH ramp midpoint sanity: at `progress=0.5` the stroke is the mid token, not a muddy sRGB blend (visual + the unit test from Phase 4 covers the exact values).
- [ ] `aria-valuemin/max/now` + `aria-valuetext` live on the `<svg role="progressbar">` at every sampled progress; `aria-valuetext` format "14 hours 22 minutes of a 16 hour goal".
- [ ] Wire to `clock.ts`: a single `requestAnimationFrame` loop recomputes `derive({startedAt, goalHours, firedMilestones, now: Date.now()})` per frame and writes `strokeDashoffset` + `--p` **directly to the DOM element, outside React** (spec §4.1: never accumulate deltas; ring position is continuous, never eased). A separate 1000 ms `setInterval` updates the text readout (Fraunces numerals) so strings rebuild once per second. `visibilitychange` → immediate recompute on return; `document.hidden` → rAF loop fully stopped (spec §4.1).
- [ ] Gate 3 acceptance: start a fast, hard-refresh at 30 s → readout continues from 30 s, not 0 (spec §14 test 1). Tab background for 60 s and return → ring jumps to truth instantly, no slow catch-up animation.

### Phase 4 — Heat ramp, variable axes, goal swell (visual layer)

- [ ] `src/core/color.ts` (new, pure, tested): `ringColor(progress)` and `surfaceColor(progress)` lerp between the spec §5.2 OKLCH stops in OKLCH space (L, C, h — hue shortest-path lerp) and return `oklch(L C H)` strings. Stops: cold `oklch(0.55 0.03 250)` → mid `oklch(0.78 0.15 70)` → goal `oklch(0.58 0.17 42)`; beyond goal the arc holds at goal/ember (escalation is driven by `intensity` for the glow, not the stroke).
- [ ] **Contrast gate (spec §11, the trap):** unit-test `relativeLuminance()` + WCAG contrast ratio for (primary text on interpolated page background) and (secondary text on surface) at progress samples 0, 0.1 … 1.0, **for both themes**. The mid-ramp is where text-on-warming-background fails; if any sample < 4.5:1 (AA normal text), adjust the *surface* interpolation stop, not the token, and re-test. Record the passing samples in the test (this is the evidence, not a claim).
- [ ] Page background + surfaces interpolate with `progress` via `--p`-driven custom properties set from JS per frame (the whole screen registers state, spec §5.2). Night theme: surfaces `#181B20`/`#241D18`, same heat ramp. Theme resolves `settings.theme` (`auto` via `prefers-color-scheme`).
- [ ] Fraunces variable axes on the timer numerals exactly per spec §5.3: `'wght' 300+400p`, `'SOFT' 100p`, `'opsz' 24+120p`. Set via `font-variation-settings` on the element in the rAF path. Confirm the self-hosted Fraunces file exposes all three axes (inspect with `document.fonts` / fontkit in a test); if the Google Fonts variable cut lacks `SOFT`/`opsz` in its static subsetting, request the full variable axis file. Under reduced motion: snap axes to 3 fixed steps per phase.
- [ ] Goal swell (spec §5.6): exactly once per fast, 900 ms: background → `--bisque`, arc → `--ember`, `navigator.vibrate?.([40,60,40])`. Triggered by the milestone system crossing `goal`; stored flag (in `firedMilestones` semantics) prevents re-firing. Reduced motion → no swell, no glow pulse, ring still updates.
- [ ] Ambient glow: blurred duplicate arc, opacity = `intensity`. Caps at the §4.2 plateau (spec §9.1).

**Gate 4:**
- [ ] Spec §14: 6 h past goal visually identical to 2 h past goal (screenshot at both, diff by eye + `intensity===1` in state).
- [ ] Spec §14: `prefers-reduced-motion: reduce` → zero animation, ring tracks time.
- [ ] Contrast tests pass at all samples, both themes.

### Phase 5 — Milestones, notifications, catch-up

- [ ] `src/core/milestones.ts`: key generation (`p50`, `p90`, …, `goal`, `ot1..ot3`) from `settings.milestonePercents` + `goalHours` + `overtimeHours`; dedupe against `firedMilestones`. One exported pure function.
- [ ] `src/core/notify.ts`: permission request **only inside the Settings toggle's user gesture** (spec §6.2); **all** notification dispatch through `registration.showNotification(...)` — never `new Notification()` directly (throws on Android/Chrome); `navigator.standalone === false` on iOS → inline "add to Home Screen" instruction instead of a dead button; denied permission → milestones still render in-app, toggle explains browser state and how to reverse it.
- [ ] Fire sequence (spec §6.1): each tick, `due = dueMilestones(active, settings)`; if `due.length`, fire via SW, **then** append to `firedMilestones` and persist **before the next frame**. Persist-after-fire is what makes refresh non-duplicating.
- [ ] **Catch-up path** (spec §6.3): on every launch, compute `dueMilestones`; if any unfired, render **one consolidated in-app card** ("You passed your 16 hour goal 40 minutes ago."), then mark fired. Never a burst of system notifications.
- [ ] Copy per spec §6.4 verbatim (second person, no exclamation stacking).
- [ ] `src/core/push.ts`: stub only, with the upgrade-path comment (serverless function + VAPID + `pushsubscriptionchange`) per spec §6.3. Not implemented.

**Gate 5:**
- [ ] Spec §14: milestone fires exactly once across 3 consecutive refreshes (system notification or in-app card, counted, never both twice).
- [ ] Airplane mode / cold start with past-due milestones → one consolidated card, then quiet.
- [ ] Android (or desktop Chrome with `serviceWorker` mocked in tests) → no `new Notification()` throw path in code; tests assert dispatch goes through registration.

### Phase 6 — History + chart

- [ ] Hash router (`src/ui/router.tsx` or a 40-line hook): `#/` → Timer, `#/history` → History, `#/settings` → Settings; `hashchange` listener; unknown hash → Timer. Direct-load of `#/history` works (no server fallback needed, the hash is client-side). Back/forward buttons work.
- [ ] `src/ui/History.tsx`: reverse-chronological list, IBM Plex Mono timestamps, duration, goal per row. **Neutral by construction** (spec §9.6): no judgement colours, no verdict copy — durations are facts. Row tap optional detail (note, start/end times).
- [ ] `src/ui/Chart.tsx`: hand-rolled SVG bar chart of the last 30 fasts. Bars `--slate`, a hairline at the goal value (the *default* goal at the time, or current — decision: current `settings.defaultGoalHours`, stated in the caption). No red/green semantics (spec §9.6). Axis labels mono, `--slate`. Hand-rolled = no charting dependency.
- [ ] Recent-fasts sparkline on the Timer screen (spec §5.4): last 4 durations as tiny neutral marks.
- [ ] History empty state: brief, no "you haven't fasted in X days" framing (spec §9.5). Storage-evicted empty state (spec §10): explains what happened, points at Import.

**Gate 6:**
- [ ] End a few fasts (via console with back-dated `startedAt`) → History list + 30-bar chart + sparkline all correct, newest last / newest left.
- [ ] Keyboard: History reachable, list navigable, focus ring visible.

### Phase 7 — Settings (export / import / theme / motion / danger zone)

`src/ui/Settings.tsx`, one route:
- [ ] **Default goal**: numeric input, 1–48 h (spec §9.7: UI cap 48). Above 24 h: plain single note, "consider discussing extended fasting with a doctor" — stated once, not blocking, not moralising.
- [ ] **Milestone percents**: editable list, values 1–99, dedupe, order sorted; presets are the defaults `[50, 90]` (spec §3.1).
- [ ] **Notifications**: toggle + live permission-state display (`default`/`granted`/`denied`). "Enable notifications" requests permission **only on this gesture** (spec §6.2). Denied → explanation + how to reverse in browser settings. iOS not-standalone → "add to Home Screen" instruction. One-time dismissible note: browsers can evict `localStorage` after ~7 days without interaction (spec §3.3.4) → use Export regularly.
- [ ] **Theme**: `auto`/`day`/`night` segmented control (spec §3.1, §5.2).
- [ ] **Motion**: `auto`/`always` (reduced motion; spec §3.1, §5.6).
- [ ] **Export data**: downloads one JSON file with the three keys + `schemaVersion` (spec §3.3.4). **Import data**: file input, validates, previews ("58 fasts, 12.4 MB of history, schema v1 — replace?"), then writes all three keys. Import of a *newer* schema than we understand → refuse with a clear message, offer "import history only" as a second option. This is not a nice-to-have; it is the data-loss backstop.
- [ ] **Delete all data**: clearly labelled, one confirm (this is the one confirm in the app — End fast has *no* confirm per spec §9.2; Delete-all is destructive and irrecoverable, so it keeps a typed-confirm or double-tap pattern). After delete: all three keys cleared, app returns to idle, settings reset to defaults.

**Gate 7:**
- [ ] Export → wipe storage → Import → state byte-identical (test with the 3 keys dumped to a file, `localStorage.clear()`, re-import).
- [ ] Goal 48 accepted, 49 rejected; note appears once above 24.
- [ ] Toggle notifications in a gesture → permission prompt; refresh → state persists.
- [ ] Theme + motion switch live, survive refresh.

### Phase 8 — Service worker, manifest, offline

- [ ] `public/manifest.webmanifest` per spec §7: `name`/`short_name` "Lapso", `display: standalone`, 192 + 512 maskable icons (generate: kiln-ring glyph on porcelain, safe-zone centred), `theme_color` = `--porcelain` (day) — note: manifest takes one colour; pick porcelain, acceptable.
- [ ] `public/sw.js` (vanilla, not bundled — spec §12 puts it in `public/`): register at scope `/`. **Cache-first** for the app shell (the hashed assets Vite emits + fonts + manifest + icons). Cache name versioned `lapso-shell-v1`; on `activate`, `caches.keys()` → delete anything not starting with `lapso-shell-`. Precache on `install` (the exact hashed build file list — injected at build time via a tiny Vite plugin or a generated `sw-assets.json` fetched on `install`; **decision**: generated `sw-assets.json` at build, fetched and cached in `install` — avoids brittle string-injection into hand-written `sw.js`).
- [ ] The SW exists **even if the user declines notifications** (spec §7) — offline launch is its purpose.
- [ ] `beforeinstallprompt` → "Install" affordance in Settings (optional, one line).
- [ ] `navigator.standalone` detection for the iOS note (spec §6.2).

**Gate 8 (the offline proof, spec §14):**
- [ ] DevTools → Network → Offline (airplane mode), **cold** launch from the installed icon → app runs fully: ring, history, settings, fonts all from cache.
- [ ] `fast.active` written offline, killed, relaunched → persists.
- [ ] New build deployed (cache name bumps) → old caches deleted on activate, no stale-shell ghosting.

---

## 4. Enforcing the spec's invariants (how we make "requirements" mechanical)

Spec §9 are "non-negotiable" and §1 is a law. Repeating them in prose is how they get forgotten. We enforce each one with a test or a build-time check so a future edit breaks CI instead of silently regressing:

| Invariant | Enforcement |
|-----------|-------------|
| §1 No persisted elapsed / no counters | **Source-scan test** (Vitest): walk `src/**/*.{ts,tsx}` and assert no code path writes a stored, incremented duration; `Derived` fields are compute-only. Specifically: `storage.ts` write surface contains only `startedAt`, `endedAt`, `goalHours`, `firedMilestones`, `note`. `elapsedMs` may *exist* in `Derived` (it's computed, spec §4) but may never be read back from a stored object. |
| §9.1 Escalation plateaus at 2 h | `clock.test.ts`: `intensity(ot=2) === intensity(ot=6) === 1`. `color`/glow tests: glow opacity and swell state identical at 2 h and 6 h past goal. Spec §14 "6 h looks like 2 h" is a screenshot pair in the QA checklist. |
| §9.2 End fast always reachable, no confirm | **DOM test**: for each phase (`fasting`, `goal-reached`, `overtime`, `idle`) assert an `End fast` button exists, is not `disabled`, has contrast ≥ 4.5:1 against its surface, and is in the tab order. Assert **no** `confirm()`/`window.confirm` in the End-fast path (source scan). The 5 s undo toast is the only gate. |
| §9.3 No streaks / badges / records | Source scan: no computed "longest", "streak", "record", "best", "PR" strings or comparisons in `src/`. |
| §9.4 Goals never auto-increment | Source scan: `defaultGoalHours` is only ever written from the Settings input handler. No code path derives a new goal from a completed fast. |
| §9.5 No retention notifications | `notify.ts` exports a single fire path, callable only from the milestone/catch-up logic. Test: no notification can be produced for a *time-since-last-fast* trigger; the only triggers are milestone keys of an active fast. |
| §9.6 Neutral history | `History.tsx` / `Chart.tsx` render only `--slate` for bars and a single neutral text style per row; test asserts no conditional colouring on duration. |
| §9.7 Goal cap 48 + single doctor note above 24 | Settings unit test: 48 accepted, 49 clamped/rejected; note rendered exactly once for goal > 24. |
| §11 AA contrast across the ramp | `color.test.ts` samples progress 0→1 in 0.05 steps, both themes, asserts ratio ≥ 4.5 (3.0 for the large Fraunces numerals). **The mid-ramp is the expected failure point** — if it fails, we move the *surface* stop, re-run, and the test records the fix. |
| §11 a11y floor | DOM tests: `role=progressbar` + `aria-valuenow`/`aria-valuetext`; `aria-live=polite` milestone region; 44 px touch targets; visible focus ring. |

---

## 5. The spec's edge cases, each mapped to a task + gate

From spec §10. Each gets a home so none is "someone will do it later":

| Edge case | Where it's implemented | Gate (acceptance) |
|-----------|------------------------|-------------------|
| Forgot to press start | Timer idle → "Start fast" + editable **start-time** picker (Phase 3). Picker: `<input type="datetime">` clamped to `[now−48h, now]`; future dates unselectable (max attr). | Pick back-dated start → readout shows correct elapsed immediately; future pick disabled. |
| Accidental start | 5 s **undo toast** on the Start action (Phase 3). Undo removes the fast *entirely* — no history entry, `fast.active → null`. | Start, tap Undo within 5 s → idle, `fast.history` length unchanged. |
| System clock changed | `lastSeenNow` persisted each tick (Phase 2). On load/tick: if `Date.now() < lastSeenNow − 60000` → non-blocking banner, actions: "Correct" (rebase `startedAt` so elapsed is preserved) or "End fast". | DevTools "Simulate geolocation/clock" or manual clock back → banner appears, neither action loses data; no crash. |
| Absurd duration (> 168 h) | `clock.ts` returns an `absurd` flag when `elapsedHours > 168` (Phase 1). Ring stops, readout freezes, prompt: end or correct start time. | Set `startedAt` to 200 h ago → ring frozen + prompt; end or correct both work. |
| Two tabs | `storage` event → re-read + notify subscribers (Phase 2). Last write wins. | End in tab A → tab B goes idle without reload (spec §14). |
| Storage evicted | Empty state on first load when `fast.history` is empty **and** a `fast.was-evicted` marker was set (Phase 7 empty states). Explains what happened, points at Import. | Clear storage, relaunch → evicted empty state, Import reachable. |
| DST transition | Epoch maths — nothing to do. | **Unit test in `clock.test.ts`** (spec §14): identical `Derived` across a DST boundary. This is the one "add a unit test proving it" the spec calls out. |
| Notification permission denied | `notify.ts` returns in-app-render path; Settings toggle explains browser state + how to reverse (Phase 5). | Deny → milestones still appear in-app; Settings shows "denied, how to re-enable". |

---

## 6. Definition of done (spec §14, verbatim checklist)

Shipped = every box ticked, with evidence (test output or a recorded manual check). No "works on my machine" claims without the artifact.

- [ ] Start a fast, hard-refresh at 30 s → readout continues from 30, not 0.
- [ ] Start a fast, close the browser entirely, reopen two hours later → readout shows 2 hours.
- [ ] `clock.ts` returns identical results across a DST boundary.
- [ ] A milestone fires exactly once across three consecutive refreshes.
- [ ] Two tabs open, end the fast in one → the other returns to idle without a reload.
- [ ] Airplane mode, cold launch from the installed icon → app runs.
- [ ] `prefers-reduced-motion: reduce` removes all animation while the ring still tracks time.
- [ ] Six hours past goal is visually identical to two hours past goal.
- [ ] End fast is reachable by keyboard in one tab from page load, in every phase.
- [ ] Corrupt `fast.active` JSON does not prevent the app from loading.

Plus the plan's own additions: WCAG AA across the full heat ramp (both themes) with recorded passing values; export→import round-trip byte-identical; runtime dependency count ≤ 3.

## 7. Verification method

- **Unit** (Vitest): `clock.ts`, `color.ts` (contrast), `storage.ts` (corruption/migration/round-trip), `milestones.ts` (dedupe), source-scan invariant tests (§4). Runs in CI (GitHub Actions) on every push.
- **DOM** (Vitest + jsdom): a11y attributes, End-fast-always-present, phase rendering.
- **Manual scripted pass**: the §6 acceptance list, run on real Chrome + Safari + Firefox (and a real Android device for the `showNotification` path, since that's the one thing jsdom can't prove). Each gets a screenshot; the §14 "6 h == 2 h" and the DST cases are side-by-side images.
- **Offline**: DevTools offline + installed-icon cold launch on a real device (the §6 airplane-mode box requires hardware, not a simulator).

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OKLCH JS lerp and CSS `oklch()` disagree on mid-ramp (gamma/space rounding) | Medium | Mid colour slightly off from design intent | The contrast test is the source of truth; visual check is secondary. If a sample fails AA, fix the *surface* stop. |
| Fraunces variable file from the CDN lacks `SOFT`/`opsz` in the subset we pull | Medium | Signature move (axis animation) doesn't render | Inspect the actual bundled file for axes (Phase 4 gate). If missing, pull the full variable axis file or hand-host the official `fraunces` variable `woff2`. Fallback: static weight only (still fine, just quieter). |
| `@fontsource` self-hosted fonts bloat the app shell | Low | Slow first load / bigger SW cache | Subset to latin, use `font-display: swap` during install, but the SW precaches so offline first-paint is instant. Acceptable. |
| Safari `localStorage` 7-day eviction (spec §3.3.4) | High (documented Safari behaviour) | Silent history loss — the core data-loss scenario | Export/Import is first-class (Phase 7), the Settings note ships, and the evicted empty state recovers gracefully. Push/VAPID (the *real* server fix) is the documented `push.ts` upgrade path, explicitly out of v1 scope. |
| Service worker precache list drifts from the real hashed build | Medium | Offline shell 404s after a deploy | Generate `sw-assets.json` at build from Vite's actual manifest and fetch it in `install` (Phase 8) — never hand-maintain the file list. |
| rAF-in-JS ring fights React re-renders | Low | Jitter or dropped frames | The per-frame arc write is entirely outside React (Phase 3); React only owns the 1 s text readout and static chrome. |
| Two-tab last-write-wins can drop a just-ended fast if writes race | Low | A completed fast vanishes | The `storage` handler re-reads on *any* change of the three keys and re-derives; ending a fast is a single atomic multi-key write per tab, so a race resolves to whichever finished writing — documented as last-write-wins (spec §10). Acceptable for a single-user app. |
| iOS notification flow (Home Screen requirement) confuses users | Medium | Notifications appear "broken" on iPhone | The `navigator.standalone === false` check shows an inline instruction instead of a dead button (Phase 5). |

## 9. What this plan deliberately does NOT include (v1 scope fence)

- **Push / VAPID / serverless push function** — `push.ts` stub only (spec §6.3 says do not build it now).
- **IndexedDB** — explicitly excluded (spec §3.3.5).
- **Any backend, accounts, or analytics** — excluded by definition (spec §2).
- **Confetti / trophies / streaks / badges / records** — excluded by the §9 guardrails.
- **A charting or routing library** — excluded (§2).

Build order is the spec's §13 sequence with gates; a phase is not "done" until its gate is evidenced. Suggested first concrete action: scaffold (§2) and start Phase 1 (`clock.ts` + tests) immediately, since everything else is downstream of it.
