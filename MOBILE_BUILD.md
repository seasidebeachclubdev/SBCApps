# SBC Member App - Mobile Build Guide

The member portal (`sbc-member-portal/`) ships as a native iOS + Android app via
Capacitor. The web code is the same one deployed to members.sbcri.com; Capacitor
wraps the built `dist/` in a native shell.

- **App name:** Seaside Beach Club
- **Bundle ID / Application ID:** `com.sbcri.member`
- **Capacitor config:** `sbc-member-portal/capacitor.config.json`

The employee app and admin dashboard are **not** native; they are installable
PWAs served from Vercel. Only the member portal builds to the app stores.

---

## One-time `.env` (both platforms)

The Supabase URL + anon key are baked into the web bundle at build time. They are
the public (publishable) keys, safe to embed. Create `sbc-member-portal/.env`:

```
VITE_SUPABASE_URL=https://epqvclktovtssfafgdgj.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_Y4jS2hje1D-j0MkysN2HfA_HJGf_RuA
```

This file is gitignored, so a fresh clone will not have it. Create it before the
first build.

---

## iOS (requires a Mac with Xcode 15+)

The iOS project cannot be built on Windows. Do this on the Mac.

```bash
# 1. Clone and check out the mobile branch
git clone https://github.com/seasidebeachclubdev/SBCApps.git
cd SBCApps
git checkout mobile/capacitor
cd sbc-member-portal

# 2. Create .env (values above)

# 3. Install deps, build the web bundle, sync into the iOS project
npm install
npm run build
npx cap sync ios

# 4. Open in Xcode
npx cap open ios
```

In Xcode:

1. Select the **App** target -> **Signing & Capabilities**.
2. Set **Team** to the club's Apple Developer account (you must be added as a
   team member with at least App Manager / Developer role). Xcode auto-manages
   the provisioning profile.
3. Confirm the bundle identifier is `com.sbcri.member`.
4. Pick a simulator (e.g. iPhone 15) or a plugged-in device, press **Run**.
5. The app launches to the member login. Test account:
   `test.member@sbcri.com` / `TestMember2026!`

No special device permissions are required (the member app receives QR passes by
email; it does not use the camera).

### TestFlight / App Store

1. Set the device target to **Any iOS Device (arm64)**.
2. **Product -> Archive**.
3. In the Organizer, **Distribute App -> App Store Connect -> Upload**.
4. The build appears in App Store Connect under TestFlight after processing.
   Add testers, or submit for App Store review.

App Store review takes ~1-7 days and may need one resubmission. Have a demo
member account ready for the reviewer.

---

## Android (Windows, via Android Studio)

Android builds from the native-Windows copy (Gradle over the WSL filesystem is
unreliable). A working copy already exists at
`C:\Users\ryanm\Code\SBC-mobile\sbc-member-portal`.

To refresh it with the latest web code:

```powershell
# from the WSL repo, sync source into the Windows copy, then:
cd C:\Users\ryanm\Code\SBC-mobile\sbc-member-portal
npx vite build
npx cap sync android
```

Then open `…\SBC-mobile\sbc-member-portal\android` in **Android Studio**
(Ladybug / 2024.2 or newer for AGP 8.7), let Gradle sync, create a Pixel
emulator (API 34/35) or plug in a device, and press **Run**.

Release build for Google Play:

1. **Build -> Generate Signed Bundle / APK -> Android App Bundle (.aab)**.
2. Create or select the upload keystore (store it safely; the same key must sign
   every future update).
3. Upload the `.aab` to Google Play Console -> Internal testing, then promote to
   production after review.

### Known Android fix already applied

`android/build.gradle` forces `kotlin-stdlib*` to 1.8.22 to resolve a duplicate
-class conflict from `cordova-android`. Keep that block if the project is
regenerated.

---

## Icons & splash

Per-app icons are generated from `tools/icon-source-*.svg`. The member native
icon + splash come from `tools/gen-native.mjs` -> `resources/` ->
`npx @capacitor/assets generate`. To swap in the club's real logo: replace the
source SVGs (or `resources/icon.png`), rerun the generators, and `cap sync`.
