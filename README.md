# Vaultline — Offline Password Vault & Smart Import

Vaultline is a zero-network, local-only password manager with deterministic rule-based **Smart Import**, envelope AES-256-GCM encryption, RFC 6238 TOTP authenticator codes, a CSPRNG password/passphrase generator, a local security audit, and portable `.vlbak` encrypted backups.

Because this workspace builds a Vite + React web application (`dist/`), an Android `.apk` binary cannot be compiled directly inside a Node-only container. Use this guide to run the project locally and package it into a signed offline Android `.apk` on your computer.

---

## 1. Project Structure

- `src/core/crypto.ts` — Web Crypto `PBKDF2-SHA256` key derivation, `AES-256-GCM` envelope encryption with AAD parameter binding, non-extractable IndexedDB device keystore key, `.vlbak` portable backup encryption/decryption, and RFC 6238 TOTP generator.
- `src/core/parser.ts` — Deterministic 10-step Smart Import engine (normalization, JSON/CSV/TSV/free-text detection, record segmentation, labelled pair extraction, token scoring with explanations, deduplication, and saved local templates).
- `src/core/brandDictionary.ts` — Bundled Public Suffix List subset and global/Indian service dictionary (SBI, HDFC, Paytm, IRCTC, DigiLocker, Instagram, Google, GitHub, etc.).
- `src/core/password.ts` & `src/core/wordlist.ts` — CSPRNG password and EFF-style diceware passphrase generator, entropy/pattern strength meter, and local security audit (weak, reused, and >1 year old passwords).
- `src/core/storage.ts` & `src/core/i18n.ts` — Local storage persistence and English/Hindi (`en` / `hi`) strings.
- `src/components/` — Onboarding, Lock screen, two-pane Vault view, Add/Edit entry modal (Login, Card, Bank/UPI, Wi-Fi, Secure Note, Identity), Smart Import review UI, Generator, Security Audit, Backup & Restore, Recycle Bin, Settings, and About Security.

---

## 2. Run & Test Locally

### Prerequisites
- Node.js 20+ and `npm`

### Commands
```bash
# Install dependencies
npm install

# Run unit tests (crypto, Smart Import parser, password generator & audit)
npx tsx --test src/core/crypto.test.ts src/core/parser.test.ts src/core/password.test.ts

# Type-check and build production bundle into dist/
npm run lint
npm run build

# Start local dev server on http://localhost:3000
npm run dev
```

---

## 3. Build an Offline Android APK from This Project (Capacitor)

You can wrap the compiled `dist/` bundle into a standalone offline Android `.apk` using **Capacitor** and **Android Studio** on Windows, macOS, or Linux.

### Prerequisites
- [Android Studio](https://developer.android.com/studio) (includes Android SDK & JDK 17+)
- Android SDK Platform 34+ and Build-Tools installed via Android Studio SDK Manager

### Step 1: Build the Web Bundle
```bash
npm install
npm run build
```
This outputs the self-contained static bundle into `dist/` with zero external font or API requests.

### Step 2: Initialize Capacitor & Add Android Platform
```bash
npm install @capacitor/core
npm install -D @capacitor/cli

npx cap init "Vaultline" "app.vaultline.offline" --web-dir dist
npm install @capacitor/android
npx cap add android
npx cap sync android
```

### Step 3: Enforce Vaultline's Offline & Security Guarantees in `android/`

Before building the APK, apply these critical hardening settings to the generated Android project:

1. **Remove all network permissions** in `android/app/src/main/AndroidManifest.xml`:
   Delete or omit:
   ```xml
   <!-- Remove this line so the OS blocks all sockets -->
   <uses-permission android:name="android.permission.INTERNET" />
   <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
   ```
   Also set `android:allowBackup="false"` on the `<application>` tag in `AndroidManifest.xml` so Android cloud/ADB backups never copy local vault storage:
   ```xml
   <application
       android:allowBackup="false"
       android:dataExtractionRules="@xml/data_extraction_rules"
       ... >
   ```

2. **Block screenshots and Recents previews (`FLAG_SECURE`)** in `android/app/src/main/java/app/vaultline/offline/MainActivity.java` (or `.kt`):
   ```java
   import android.os.Bundle;
   import android.view.WindowManager;
   import com.getcapacitor.BridgeActivity;

   public class MainActivity extends BridgeActivity {
     @Override
     public void onCreate(Bundle savedInstanceState) {
       super.onCreate(savedInstanceState);
       getWindow().setFlags(
         WindowManager.LayoutParams.FLAG_SECURE,
         WindowManager.LayoutParams.FLAG_SECURE
       );
     }
   }
   ```

3. **Keep `minSdkVersion >= 29` (Android 10+)** in `android/variables.gradle` so background apps cannot read clipboard contents.

### Step 4: Build a Debug APK (Quick Testing / Sideload)
```bash
cd android
./gradlew assembleDebug
```
Output APK:
```text
android/app/build/outputs/apk/debug/app-debug.apk
```
Install directly onto a connected Android phone with USB debugging enabled:
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Step 5: Build a Signed Release APK
1. Generate a signing keystore (keep this file and password safe; back it up):
   ```bash
   keytool -genkey -v -keystore vaultline-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias vaultline
   ```
2. Configure signing in `android/app/build.gradle` (inside `android { signingConfigs { release { ... } } buildTypes { release { signingConfig signingConfigs.release; minifyEnabled true } } }`).
3. Compile the release APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   Output APK:
   ```text
   android/app/build/outputs/apk/release/app-release.apk
   ```

### Step 6: Verify Zero-Network & Signature
Use Android SDK build-tools (`aapt` and `apksigner`) to verify that the APK declares zero network permissions:
```bash
aapt dump permissions android/app/build/outputs/apk/release/app-release.apk
# Expected: no android.permission.INTERNET

apksigner verify --verbose android/app/build/outputs/apk/release/app-release.apk
```

---

## 4. Alternative: Native Kotlin + Jetpack Compose Implementation

If you prefer a pure native APK (no WebView) using **Argon2id**, **Android Keystore StrongBox**, **BiometricPrompt (`CryptoObject`)**, and **Android AutofillService**, port the pure logic modules directly from `src/core/` into Kotlin:

- `src/core/parser.ts` + `src/core/brandDictionary.ts` -> `:core-parser` (pure Kotlin JVM module; reuse test cases from `src/core/parser.test.ts`).
- `src/core/crypto.ts` -> `:core-crypto` (replace Web Crypto `PBKDF2` + IndexedDB key with `argon2kt` / Bouncy Castle Argon2id + Android `KeyGenParameterSpec` AES-256-GCM wrapping).
- `src/core/password.ts` + `src/core/wordlist.ts` -> `:feature-generator` & security audit domain layer.

See `/public/assets/aistudio/Offline_Password_Manager_APK___Blueprint_be96d254.md` for the full native module architecture and Room schema.

---

## 5. Moving Data Between Web and Android

1. In Vaultline, open **Backup & Restore** -> confirm your master password -> click **Download `.vlbak`**.
2. Transfer the `.vlbak` file to your Android device (USB, local file transfer, or SD card).
3. On Android Vaultline, select **Restore from `.vlbak` backup** and enter your master password.
