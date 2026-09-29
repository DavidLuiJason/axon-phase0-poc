# PHASE0_REPORT — axon-phase0-poc

## What was built

Standalone Capacitor 6 + React 18 + TypeScript 5.6 + Vite 5 + Tailwind 3 project implementing:

- **Native Kotlin foreground service** (`BackgroundJobService`) that owns heartbeats, wake lock, notification updates, SQLite-free JSONL log + state persistence, START_STICKY recovery with explicit `RESTARTED` + gap, `onTimeout` → TIMEOUT event + stopSelf.
- Job types: **counter** (open-ended) and **steps** (finite multi-label demo).
- Capacitor plugin **BackgroundJobs** (bridge) + TypeScript `BackgroundExecutionAdapter` with honest **web fallback** (“cannot run in background; foreground only”).
- Single-screen PoC UI: controls, elapsed from `startedAt`, activity labels, evidence panel with verdict, health panel, idle check, export diagnostics, PoC-only command box.
- Unit tests: elapsed format, verdict/gaps (including kill/restart/timeout), step label changes.

**Did not** copy AXON logic or logo. Reference zip used only for stack awareness.

## Commands run in this environment

| Command | Result |
|---------|--------|
| `node -v` | v24.15.0 |
| `npm install` | Started; `@capacitor/*` present under `node_modules`. Full lockfile completion not confirmed before packaging (sandbox network/IO slow). |
| `npm test` | See “Tests” below — run when `node_modules` complete. |
| `npm run build` | Not run to completion in sandbox (no guaranteed install finish). |
| `npx cap sync` / `./gradlew assembleDebug` | **Not run.** No Android SDK (`ANDROID_HOME` empty). No APK produced. |

## IMPLEMENTED / COMPILED / RUN-ON-DEVICE

| Item | Status |
|------|--------|
| Project scaffold (Vite/React/TS/Tailwind/Capacitor config) | **IMPLEMENTED** |
| Unit tests (format, verdict, labels) | **IMPLEMENTED** (source present) |
| Native FGS + JobStore + plugin (Kotlin) | **IMPLEMENTED** (source present) |
| Web adapter honesty | **IMPLEMENTED** |
| UI panels per spec | **IMPLEMENTED** |
| Gradle wrapper properties + android/ tree | **IMPLEMENTED** (wrapper **jar** not bundled; generate on device/CI) |
| `npm install` fully verified | **PARTIAL** (deps partially present) |
| TypeScript compile / Vite build | **NOT VERIFIED** in sandbox |
| Gradle assembleDebug | **NOT RUN** (no Android SDK) |
| APK | **NO APK WAS BUILT** |
| Run on a physical device | **UNVERIFIED** — owner must run T1–T8 |

Every device behavior claim is **UNVERIFIED** until the owner tests with the protocol in `EVIDENCE.md`.

## Chosen foreground service type

- **Type:** `specialUse`
- **Permission:** `FOREGROUND_SERVICE_SPECIAL_USE`
- **Manifest property:** `android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE` with free-form explanation for Play review.
- **Reasoning:** Android 15 restricts `dataSync` and `mediaProcessing` to a limited window (~6h / 24h). Open-ended user-initiated heartbeat/checkpoint jobs are not covered by media, location, connectedDevice, etc. `specialUse` is the documented catch-all requiring explicit subtype disclosure.
- **Source:** [Android Developers — Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) and [Android 15 FGS changes](https://developer.android.com/about/versions/15/changes/foreground-service-types).

`onTimeout` is implemented: writes TIMEOUT, checkpoints, `stopSelf()`.

## TypeScript version

**5.6.3** pinned. AXON’s `typescript: ^7.0.2` is non-standard for this toolchain; 5.6 installs cleanly with Vite 5 / Capacitor 6.

## Known limitations

1. No Android SDK in build sandbox → cannot compile APK or prove native runtime.
2. `gradle-wrapper.jar` is not binary-committed (generate via `gradle wrapper` or Android Studio).
3. Launcher icons are minimal placeholders.
4. Battery-optimization deep-link is guidance text (full `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` can be added if policy allows).
5. OEM killers can still stop the service despite FGS + wake lock; log will show gaps/RESTARTED — never hidden.
6. Web path never claims background capability.

## File manifest

See generated `MANIFEST.sha256` in the delivery zip (path, size, sha256). Independent verification should match the zip.

## Anything we could not do

- Run on a phone.
- Produce a debug APK in this environment.
- Fully confirm `npm install` exit code under resource limits (Capacitor packages were present when packaging).
