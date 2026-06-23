# Mobile packaging & push delivery

How the single React codebase in `apps/web` ships to the App Store and
Play Store via Capacitor, and how push notifications are configured.

## Prerequisites

| Target | Needs |
|---|---|
| Android | Android Studio + SDK (any OS) |
| iOS | Xcode on **macOS** (cannot be built on Windows/Linux) |
| Push (Android/iOS) | A Firebase project (FCM) |
| Push (web) | A VAPID key pair |

## One-time native project setup

```bash
cd apps/web
npm run build                 # produces dist/
npx cap add android           # generates android/
npx cap add ios               # generates ios/ (macOS only)
```

The generated `android/` and `ios/` directories are currently **gitignored**
(see the root `.gitignore`) — each developer regenerates them with
`cap add`. This holds only while they contain nothing hand-made. As soon
as you add `google-services.json`, signing config, icons, or any manual
native change, remove those ignore entries and commit the directories,
or that work is lost.

App icons and splash screens: place a 1024×1024 `icon.png` (and optional
`splash.png`) in `apps/web/assets/`, then `npx @capacitor/assets generate`.

## Day-to-day build loop

```bash
npm run cap:sync        # build web + copy into native shells + sync plugins
npm run cap:android     # open in Android Studio
npm run cap:ios         # open in Xcode
```

The Capacitor shell loads the **built** web app from `dist/` — it does not
hot-reload. For device testing against a dev API, set `server.url` in
`capacitor.config.ts` temporarily (never commit that).

## Push notifications

In-app notifications always work (the inbox is API-backed). Email and push
are optional delivery channels, enabled by environment configuration; when
unset they are silently skipped.

### Web (VAPID)

```bash
npx web-push generate-vapid-keys
```

Set in `apps/api/.env`:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:ops@yourcompany.com
```

The frontend calls `enablePush()` from `src/lib/push.ts`, which subscribes
via `public/sw.js` and registers the subscription at `POST /push-devices`.

### Android (FCM)

1. Create a Firebase project; add an Android app with package id
   `au.com.cleartask.app`.
2. Download `google-services.json` into `apps/web/android/app/`.
3. In Firebase console → Project settings → Service accounts, generate a
   service account key JSON. Put it somewhere private on the API host and
   set `FCM_SERVICE_ACCOUNT_PATH=/path/to/service-account.json`.

### iOS (APNs via FCM)

1. Add an iOS app to the same Firebase project (bundle id
   `au.com.cleartask.app`); download `GoogleService-Info.plist` into the
   Xcode project.
2. Upload your APNs auth key (.p8) in Firebase → Cloud Messaging settings.
3. Enable the Push Notifications capability + Background Modes → Remote
   notifications in Xcode.

The API sends to Android and iOS through the same FCM HTTP v1 endpoint;
no APNs-specific server code is needed.

## Store builds

**Android (AAB):** Android Studio → Build → Generate Signed Bundle. Create
a keystore once, store it (and its passwords) in your secret manager —
losing it means you can never update the app. Upload the `.aab` in Play
Console (first time: create the listing, content rating, data-safety form).

**iOS (IPA):** Xcode → Product → Archive → Distribute App → App Store
Connect. Requires an Apple Developer Program membership, an App ID matching
the bundle id, and a distribution certificate/profile (Xcode-managed
signing handles this).

**Versioning:** bump `versionCode`/`versionName` in
`android/app/build.gradle` and the marketing/build version in Xcode for
every store upload.

## Camera (proof of completion)

`apps/web/src/lib/native.ts` exposes `captureProofPhoto()` — on device it
opens the native camera and returns a Blob for the
`POST /assignments/:id/proof` multipart upload. In a plain browser it
returns null; web screens use `<input type="file" accept="image/*"
capture>` instead. Android needs no manifest change (the Camera plugin
declares it); iOS needs `NSCameraUsageDescription` +
`NSPhotoLibraryUsageDescription` strings in `Info.plist`.
