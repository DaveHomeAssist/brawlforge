# MixMash Studio

The studio hub at **[mixmash.games](https://mixmash.games)**, served from this repo's `gh-pages` branch (the live default branch — GitHub Pages "legacy" build, not an Actions deploy).

## What's here

| Path | What it is |
|---|---|
| `/` (`index.html`, `home.html`) | Studio homepage — brand tokens, game lineup |
| `/play/` | **MIXMASH** — a DJ-powered platform fighter (the flagship game; see `docs/PLAYER_GUIDE.md`) |
| `/mars/` | MarsScape — canvas-backed isometric client with a **server-authoritative backend** (see below). No longer a build snapshot of the [marsscape source repo](https://github.com/DaveHomeAssist/marsscape) — the two have diverged; do not overwrite one with the other. |
| `/empires/` | EMPIRES (aka "Age of Dave") — WebAssembly build of the real [aoe2-clone](https://github.com/DaveHomeAssist/aoe2-clone) RTS (7 civs, combat, AI opponent; local skirmish only — no multiplayer in-browser) |
| `/garden/` | Full-viewport iframe embed of the live Garden OS story mode (`davehomeassist.github.io/garden-os/story-mode/`) — never drifts |
| `/pitch/` | **PITCH RIOT** — a self-contained arcade soccer game (single `index.html`, canvas + vanilla JS). One outfielder vs a CPU (auto keepers) across two halves; at halftime you play a built-in cover-ops minigame (a mini homage to [FIFA Pitch Crew](https://systembydave.com/fifa-pitch-crew/) from the system-by-dave repo) — show quality earns a timed "HYPED" boost for the second half. Difficulty select, keyboard + touch. No build step, no backend. |
| `/zelda2mario/` | Evidence-bound public status dashboard for the source-only Zelda2MarioCoop project. The game itself is not yet published as a playable route. |
| `ROADMAP.md` | Production roadmap **for the MIXMASH fighter specifically** — phased DoD/checkpoints/verification standards |
| `src/combat.js` | Canonical, tested knockback math for the fighter (`finite()` guard + `calcKnockback`) |
| `mars/engine.mjs`, `mars/server.mjs` | Shared MarsScape game engine + the Node authority server (SQLite locally) |
| `mars/commissioned-art.mjs`, `mars/golden-scene.html` | DEC-79 validated commissioned-art cache and in-renderer golden-scene review surface |
| `api/` | Vercel serverless functions — the production authority API (Blob-backed sessions) |
| `test/*.test.{js,mjs}`, `mars/test-*.mjs`, `mars/parity/parity.test.mjs` | Node's built-in test runner (`node --test`) — fighter combat math, the inline combat parity guard, public roster/arena count guard, extracted play modules, MixKit save, MarsScape engine/API/handler/art/parity tests |
| `.github/workflows/ci.yml` | CI — on pull requests, manual dispatch, and pushes to `gh-pages` touching any game route, `api/`, `src/`, `test/`, the hub pages, the PWA shell, or package files: runs `npm test`, `vercel-build`, the DEC-79 art validation/report/contact-sheet drift gates, `sim`, then the Playwright rails (`art:visual`, `smoke:play`, `smoke:catalog`, `smoke:landing`, `smoke:zelda2mario`) |

## Commands

```
npm install       # once
npm test          # node --test — fighter combat/parity/count guards, play modules, MarsScape engine/API/handler/art/parity tests
npm run smoke:play      # fighter resume/snapshot smoke test
npm run smoke:catalog   # catalog runtime smoke tests
npm run smoke:landing   # five-width landing, keyboard, motion, hit targets, screenshots
npm run smoke:zelda2mario # status scope, mobile/ultrawide, themes, keyboard tabs, filters and complete printing
npm run start:mars      # run the MarsScape authority server locally (SQLite) — http://localhost:8787/mars/
npm run vercel-build    # syntax-check all api/ and mars/ server files (what Vercel's build runs)
npm run art:validate    # validate DEC-79 and verify the runtime index plus strict-report parity
npm run art:report      # refresh normal, paid-test, and full-golden machine evidence
npm run art:visual      # capture game, fallback, contract, contact-sheet, and golden-scene evidence
npm run art:approve     # strict paid-test gate: 4 assets, 8 PNGs, 4 editable sources
```

> **Windows note:** `mars/test-vercel-handler.mjs` can fail with `EBUSY: resource busy or locked` deleting a temp `.sqlite-shm` file — a Windows file-locking quirk in test teardown (`node:sqlite` WAL mode), not a real defect. All assertion-level tests pass; only the cleanup hook is affected.

There is no build step for the static site itself — `index.html`, `home.html`, `/play/`, and `/empires/` are served as-is by GitHub Pages. `/mars/` is a static client too, but talks to a **separate live backend**.

The landing smoke rail checks 320, 390, 768, 1024, and 1440px. It writes screenshots
and `report.json` into a temporary directory printed on completion. Set
`LANDING_SCREENSHOT_DIR` to keep them in a specific evidence directory. For
post-deployment readback, run
`LANDING_BASE_URL=https://mixmash.games/ npm run smoke:landing`.
Gameplay-preview provenance and refresh guidance live in
[`assets/previews/README.md`](assets/previews/README.md).

### Zelda2Mario status publication

`zelda2mario/index.html` is an exact public-safe copy of the game's canonical
`docs/status/zelda2mario-project-status.html`, not a separate status source.
Edit the canonical embedded `status-data` block, validate its eleven phases and
six M2 actions against the implementation plan, then copy the complete reviewed
HTML here. Preserve the source baseline and evidence timestamp; never infer game
completion from a documentation deployment. Reconcile the project-owned Notion
records through targeted dated updates, keeping private links out of this file.

Publish through a scoped PR into `gh-pages` after applicable CI succeeds.
Legacy Pages deploys independently, so do not bypass the pre-merge CI gate.
Verify canonical/published SHA-256 parity, Pages success, the slash redirect,
and live rendering. The browser check covers 320, 390, 768, 1440 and 2560x720,
all work fields, keyboard tabs, light/dark persistence, filters and full printing.
Screenshots and a JSON report go to the temporary directory printed at exit.
Use `ZELDA2MARIO_SCREENSHOT_DIR` to retain a chosen evidence location; use
`ZELDA2MARIO_BASE_URL=https://mixmash.games/zelda2mario/ npm run smoke:zelda2mario`
for live verification. Roll back a faulty route with a scoped revert PR; do not
alter other game routes, the authority API, hosting configuration or ROM data.

## MarsScape's architecture (as of 2026-08-27)

`/mars/` stopped being a build snapshot of the `marsscape` source repo — it was rebuilt in place as a server-authoritative game:

- **Client:** `mars/index.html` + `mars/game.js` (canvas isometric board) + `mars/styles.css`. Valid commissioned PNGs are discovered only through `mars/assets/commissioned/index.json`, decoded to cached `ImageBitmap` objects, and fall back through code-owned maps and procedural rendering without blocking play.
- **Art production:** `mars/render-contract.mjs` v3 owns geometry, states, animation, lighting, accessibility, and performance values. `/mars/golden-scene.html` renders the eight-beat DEC-79 review sequence. Deterministic strict reports bind every PNG and structurally valid layered source by SHA-256 and prove runtime-index readiness. Full approval also requires all 24 canonical beat/zoom/lighting tuples, the four 1.0x lighting profiles, 1.0x fallback and reduced-motion reviews, and 300 commissioned 1.0x performance samples before Dave can attest and create a package-bound receipt in the final 1.0x view. Its client integrity digest detects drift but does not authenticate a reviewer; canonical approval requires the exported receipt plus external Git/review identity in the repo decision record.
- **Authority API:** `mars/engine.mjs` (shared game rules) served two ways — `mars/server.mjs` (Node/SQLite, for local dev via `npm run start:mars`) and `api/*.mjs` (Vercel functions, for production). The client picks the API base from a `<meta name="marsscape-api-base">` tag in `mars/index.html`, currently pointed at `https://mixmash-marsscape-authority.vercel.app/api/`.
- **Trust model:** the server is authoritative — submitted client resource totals are ignored; new sessions always start from server state, and commands (`gather`, `build`, `smelt`, `craft`, `research`, `startStorm`) are applied server-side.
- **Offline fallback:** if the authority API is unreachable, the client runs a local, HMAC-signed offline mode (WebCrypto/IndexedDB) and replays queued commands once the API returns; tampered offline saves are rejected on restore.
- **Production deploy:** the Vercel project is `mixmash-marsscape-authority`, backed by a private Vercel Blob store (env: `BLOB_READ_WRITE_TOKEN`, `MARSSCAPE_SECRET`, `MARSSCAPE_ALLOW_ORIGIN`). See `mars/README.md` for full operating limits (256 KB/5s request caps, per-session write locks, in-memory rate limiting).

**This means the old redeploy recipe (`marsscape` repo → `npm run build` → copy `dist/index.html` into `mixmash/mars/`) is obsolete and would destroy this architecture if run.** The `marsscape` GitHub repo continues to exist as an independent single-file-build project; the two `/mars/` implementations have diverged and are not currently reconciled.

`/empires/` is a manual Emscripten build snapshot copied in from the `aoe2-clone` repo (`tools/build_web.sh` there produces `aoe2-clone.js`/`.wasm`; copy them into `mixmash/empires/assets/` alongside the existing `index.html`/`shell.js`). `/garden/` needs no redeploy — it's a live iframe.

## Conventions

- **`gh-pages` is the real default branch** and the one served at mixmash.games. A separate, older `main` branch holds an earlier, unrelated development history for the fighter and is not part of the live site — don't merge between them without checking first.
- The fighter's combat math is duplicated: `src/combat.js` (tested, canonical) and an inline copy inside `play/index.html` (the shipped game). Keep them hand-synced until the game imports the module directly (tracked in `ROADMAP.md` Phase 1).
- `mixmash_opts` in `localStorage` persists match options (volume, music, hitbox display, stage hazards, both players' control binds) — don't reset it casually.
- **Do not run the old MarsScape redeploy recipe** (copying `dist/index.html` from the `marsscape` repo into `mars/`) — see "MarsScape's architecture" above. `/mars/` is now its own multi-file app with a live backend, independent of the `marsscape` source repo.
