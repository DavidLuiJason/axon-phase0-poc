# Axon Phase0 PoC — Build Instructions

## Stack (pinned)

| Component | Version |
|-----------|---------|
| Node | 20 LTS (see `.nvmrc`) — sandbox had v24; use ≥18 |
| TypeScript | **5.6.3** (AXON used `^7.0.2` which is unusual; 5.6 installs cleanly) |
| React | 18.3.1 |
| Vite | 5.4.11 |
| Tailwind CSS | 3.4.16 |
| Capacitor | 6.2.0 |
| JDK | 17 or 21 |
| Android compileSdk | **35** |
| Android targetSdk | **35** |
| Android minSdk | **24** |
| Gradle | 8.7 (wrapper) |
| AGP | 8.5.2 |
| Kotlin | 1.9.24 |
| applicationId | `com.axon.phase0poc` |

## Prerequisites

1. Node 18+ / 20 recommended (`nvm use` if using nvm)
2. JDK 17+ on `PATH`
3. Android SDK with platform 35 and build-tools
4. Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`)

## Exact commands

```bash
# 1. Install JS deps
npm install

# 2. Unit tests (runnable without Android)
npm test

# 3. Web build
npm run build

# 4. Sync web assets + native project
npx cap sync android
# equivalent script:
npm run cap:sync

# 5. Assemble debug APK
cd android
./gradlew assembleDebug
# or from root:
npm run android:assembleDebug
```

APK path after successful assemble:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

## First-time Android notes

- If `gradle-wrapper.jar` is missing, from a machine with Gradle installed:

  ```bash
  cd android && gradle wrapper --gradle-version 8.7
  ```

- Or open the `android/` folder in Android Studio once; it will download the wrapper and SDK components.

- Grant **Notifications** on Android 13+ when prompted.

- For best background survival, exempt the app from battery optimization (Health panel in the app explains this).

## Foreground service type

**`specialUse`** with manifest property `android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE`.

Reasoning: Android 15 limits `dataSync` and `mediaProcessing` to ~6 hours per 24h. This PoC needs open-ended user-initiated jobs not covered by other types.  
Source: [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) (Android Developers).

## Zip-to-APK tool

This project uses a standard Capacitor layout (`webDir: dist`, `appId: com.axon.phase0poc`, Gradle wrapper under `android/`). No secrets. No manual source edits should be required after `npm install && npm run build && npx cap sync android`.
