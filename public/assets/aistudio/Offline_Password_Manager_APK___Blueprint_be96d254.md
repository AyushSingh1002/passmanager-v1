# Offline Password Manager APK — Blueprint

Nov 25, 2026 · @ayu

## Product summary

Build a native Android password manager (working name **Vaultline**) that has no INTERNET permission at all, encrypts everything on-device, and turns messy pasted text into structured accounts using deterministic rules, not AI.

**Goals**

- Zero network: the APK declares no INTERNET permission, so the OS itself blocks all traffic.
- Smart Import: paste a raw dump (notes, CSV, chat messages) and the app splits it into Account / Username / Password / URL / Notes with a confidence score per field.
- Mobile-first, minimal, calm UI with 150–300 ms motion that never blocks input.
- Fast: unlock under 1.5 s on a mid-range phone; search results under 50 ms for 2,000 entries.

**Non-goals (v1)**

- No cloud sync, accounts, analytics, crash reporting or ads.
- No ML models, LLMs or remote breach lookups.
- No iOS build (Kotlin Multiplatform can come later).

## Offline guarantee and threat model

Offline is enforced by the manifest, not by promise: with no `android.permission.INTERNET`, any socket call fails at the OS level, and anyone can verify it with `aapt dump permissions`.

**Offline enforcement**

- Manifest declares no INTERNET or ACCESS\_NETWORK\_STATE; a CI check fails the build if any dependency merges one in.
- `android:allowBackup="false"` plus `dataExtractionRules` excluding everything, so Android cloud backup never copies the vault.
- No Google Play Services, Firebase, analytics or crash SDKs. Dependency allow-list reviewed per release.
- Ship via direct APK / F-Droid style reproducible build, signed with APK Signature Scheme v2+ only.

**What it defends against**

| Threat | Defence |
| --- | --- |
| Lost or stolen phone | Argon2id-derived key, Keystore-wrapped vault key, auto-lock, progressive lockout |
| Copy of the vault file taken off the device | Vault key wrapped by a non-exportable Keystore key; Argon2id makes guessing slow |
| Screenshots, screen recording, Recents preview | `FLAG_SECURE` on every window, on by default |
| Clipboard snooping | Sensitive-flagged clips, auto-clear after 30 s |
| Brute force on the lock screen | Lockout 5 fails → 30 s, doubling to a 30 min cap; persists across restarts |
| Shoulder surfing | Passwords masked by default; reveal is press-and-hold |

**Stated out of scope** (shown honestly in Settings → About security): a rooted device with active instrumentation, a compromised keyboard, a phone unlocked with the vault open, and a forgotten master password (no recovery exists, by design).

## Tech stack and architecture

Kotlin + Jetpack Compose with a clean three-layer architecture (UI → domain → data), single Activity, min SDK 29 (Android 10) so background apps cannot read the clipboard.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Kotlin 2.x, coroutines + Flow | Native, fast, no JS bridge holding secrets |
| UI | Jetpack Compose + Material 3 (custom theme) | Mobile-first layouts, built-in motion APIs |
| Navigation | Compose Navigation, single Activity | One window to apply `FLAG_SECURE` to |
| DI | Hilt (or Koin) | Testable crypto and parser modules |
| Storage | Room on SQLCipher (or Room + per-field AES-GCM) | Encrypted at rest, queryable |
| KDF | Argon2id via a vetted native lib (e.g. argon2kt / Bouncy Castle) | Memory-hard, OWASP first choice |
| Cipher | AES-256-GCM (javax.crypto / Tink AEAD) | Authenticated encryption |
| Key storage | Android Keystore, StrongBox when present | Non-exportable hardware-backed wrapping key |
| Biometrics | androidx.biometric with `CryptoObject` | Biometric actually unlocks a key, not a boolean |
| Strength meter | zxcvbn port (Kotlin/Java), bundled dictionaries | Offline, pattern-aware scoring |
| Build | Gradle KTS, R8 full mode, reproducible builds | Smaller APK, no stray deps |

**Modules**

- `:app` — Activity, navigation, theme.
- `:feature-vault`, `:feature-import`, `:feature-generator`, `:feature-settings` — Compose screens + ViewModels.
- `:core-crypto` — KDF, AEAD, Keystore wrapping, secure memory wipes. No Android UI deps.
- `:core-parser` — the Smart Import engine, pure Kotlin/JVM so it is unit-testable on a laptop.
- `:core-data` — Room DAOs, repositories, backup/export.
- `:core-autofill` — AutofillService implementation.

## Encryption and vault design

Use envelope encryption: a random 256-bit Vault Key (VK) encrypts the data; VK is wrapped twice — once by a key from the master password, once by the hardware Keystore — so stealing the file alone is not enough.

1. **Setup:** generate a 16-byte salt and a random 32-byte VK with `SecureRandom`.
2. **Password key:** `PK = Argon2id(master, salt, m = 64 MiB, t = 3, p = 1)`. This is above the OWASP minimum of 19 MiB / t = 2 / p = 1; benchmark on first run and lower memory (never below the OWASP floor) on low-RAM phones.
3. **Hardware key:** create a non-exportable AES-256-GCM key in Android Keystore (`setIsStrongBoxBacked(true)` when available, `setUnlockedDeviceRequired(true)` on API 28+).
4. **Wrap:** `wrappedVK = AES-GCM(KeystoreKey, AES-GCM(PK, VK))`. Store with salt, KDF params and a format version.
5. **Bind metadata:** put `version | kdf | m | t | p` into GCM associated data so a downgrade of parameters breaks decryption.
6. **Records:** each entry is serialised to JSON and sealed with AES-256-GCM under VK with a fresh 12-byte nonce; only a non-secret `id`, `updatedAt` and a keyed search token are stored in clear.
7. **Biometric unlock (optional):** a second Keystore key with `setUserAuthenticationRequired(true)` wraps VK; unlock through `BiometricPrompt` + `CryptoObject`. Ask for the master password every 7 days so it is not forgotten.
8. **Memory hygiene:** hold master password and VK in `CharArray`/`ByteArray`, zero them on lock, never in `String`, never logged.

**Backups:** an encrypted `.vlbak` file (Argon2id + AES-GCM under the master password only, independent of the Keystore) saved via the Storage Access Framework. This is the only recovery path if the phone is reset, because a factory reset destroys Keystore keys. Prompt for a backup after setup and every 30 days.

**Interop:** import/export KeePass KDBX 4 and Bitwarden/Chrome CSV so users are never locked in; plaintext CSV export requires the master password and shows a warning.

## Smart Import: rule-based classifier (no AI)

Smart Import is a deterministic pipeline of regex, dictionaries and weighted scores: the same input always gives the same output, it runs fully offline in under 100 ms for 500 lines, and every decision can be explained to the user ("marked as password: 14 chars, 4 character types, no spaces").

**Input sources:** paste box, Android share sheet (`text/plain`), and file pick via Storage Access Framework (.txt, .csv, .json, .kdbx). Camera OCR is left out because on-device OCR is machine learning.

**Pipeline**

1. **Normalise** — unify line endings, strip BOM and zero-width characters, trim, collapse bullets (`• - * 1.`) and smart quotes.
2. **Detect format** — in order: JSON (parses?), CSV/TSV (consistent delimiter count + header row matching known exports from Chrome, Bitwarden, LastPass, 1Password, KeePass), otherwise free text.
3. **Segment into records** — a new record starts at a blank line, a heading line (ends in `:` or is a known service name alone on a line), a URL/domain, or when a label already filled in the current record repeats (a second `password:`).
4. **Extract labelled pairs** — match `label  separator  value` where separator is `: = - – > |` or tab. Label synonyms (case-insensitive): account/site/app/service/website; user/username/login/id/email/mail/phone/mobile; pass/password/pwd/pw/pswd/passcode/key; pin/mpin/upi pin; url/link; note/notes/hint; 2fa/otp/secret/backup code.
5. **Split unlabelled lines** — lines like `gmail  john@x.com  Hunter2!` or `john@x.com / Hunter2!` are split on runs of 2+ spaces, tab, `/`, `|`, `:` or `,` into tokens.
6. **Score every token** against each field (table below) and keep a reason string for each score.
7. **Assign fields** — per record, pick the highest total score with constraints: at most one account, one username, one password, one URL; leftover tokens go to Notes. Use a positional prior: in free text the order is usually account → username → password (+0.10 when a token sits in its expected slot).
8. **Fill gaps** — no account name but a URL or email domain exists → derive it from the registrable domain via a bundled Public Suffix List (`accounts.google.com` → Google). Map common domains to brand names with a bundled dictionary of about 1,500 services, including Indian ones (SBI, HDFC, Paytm, PhonePe, IRCTC, DigiLocker).
9. **Confidence** — record confidence = lowest field score. ≥ 0.80 auto-accept, 0.55–0.79 "check", below 0.55 "needs you".
10. **De-duplicate** — same (domain, username) as an existing entry → offer Update, Keep both or Skip.

**Scoring rules (0–1 per field)**

| Signal | Field | Score |
| --- | --- | --- |
| Explicit label matched | that field | 0.98 |
| RFC-style email regex | Username | 0.95 |
| `https?://` or domain + valid public suffix | URL | 0.95 |
| Exact match in brand dictionary | Account | 0.92 |
| 10–15 digit phone pattern (+91 etc.) | Username | 0.80 |
| 4–6 digits only, labelled or after a bank name | PIN | 0.85 |
| Length 6–128, no spaces, ≥ 3 of {lower, upper, digit, symbol} | Password | 0.85 |
| Shannon entropy ≥ 3.0 bits/char and not a dictionary word | Password | +0.10 |
| zxcvbn guesses ≥ 10^6 | Password | +0.05 |
| `[a-z0-9._-]{3,32}`, mostly lowercase, ≤ 1 symbol, or starts with `@` | Username | 0.70 |
| Title Case 1–3 words alone on a line, not in dictionary | Account | 0.60 |
| Base32 string of 16–64 chars, labelled 2fa/secret | TOTP secret | 0.90 |
| 3+ space-separated words | Notes | 0.70 |
| Matches email or URL | Password | −0.60 |

**Worked example** — input:

```text
Insta
@riya.k  Sunflower#2291

SBI net banking - user: riyak88 pwd: Kx9!pLm2 
mpin 4821
```

Output: record 1 = Instagram (dictionary alias "Insta") / `@riya.k` (handle, 0.70 + 0.10 position) / `Sunflower#2291` (password 0.95); record 2 = SBI / `riyak88` (label, 0.98) / `Kx9!pLm2` (label, 0.98) / PIN 4821 (0.85). Record 1 scores exactly 0.80, so it is accepted, but without the position bonus the handle would score 0.70 and the card would ask for a check.

**Review screen:** each parsed record is a card with coloured field chips; tap a chip to reassign it, drag a token between fields, swipe right to accept, left to discard, and "Accept all high-confidence" in one tap. When the user corrects a pattern, offer "Apply to similar lines", which saves a local template (e.g. `name / user / pass` order). That is a stored rule, not learning, and is listed and deletable in Settings.

**Hygiene:** raw text lives in a `CharArray`, never written to disk or logs, wiped after import; after pasting, the app offers to clear the clipboard; the source text file is never modified.

## Feature set

Beyond storage and Smart Import, these are the features established offline managers (KeePassDX, 1Key, Pass Tech) treat as baseline; P0 ships in v1.

| Feature | What it does | Priority |
| --- | --- | --- |
| Master password + biometric unlock | Argon2id unlock; fingerprint/face via Keystore-bound key | P0 |
| Smart Import | Raw text → structured entries (section above) | P0 |
| Vault list + instant search | Fuzzy search over name, username, URL, tags | P0 |
| Entry types | Login, Card, Bank/UPI, Wi-Fi, Secure note, Identity | P0 |
| Password generator | Random (8–128 chars, class toggles, exclude look-alikes) and passphrase (4–8 words from a bundled EFF-style word list) | P0 |
| Strength meter | zxcvbn score 0–4 with plain-language feedback | P0 |
| Secure copy | Sensitive-flagged clipboard, auto-clear after 30 s (configurable) | P0 |
| Auto-lock | On background after 0/30 s/1/5 min, on screen off, on timeout | P0 |
| Screenshot block | `FLAG_SECURE` everywhere, toggle with warning | P0 |
| Encrypted backup + restore | `.vlbak` via file picker, reminder every 30 days | P0 |
| Autofill service | Android Autofill Framework fills logins in other apps and browsers | P1 |
| TOTP authenticator | Store 2FA secrets, show 6-digit codes with countdown ring (time-based, works offline) | P1 |
| Security audit | Flags weak, reused, old (> 1 year) and duplicate passwords locally | P1 |
| Password history | Last 10 versions per entry, restorable | P1 |
| Recycle bin | Deleted entries kept 30 days | P1 |
| Import/export | KeePass KDBX 4, Bitwarden/Chrome CSV | P1 |
| Tags + favourites | Filter chips, pinned items on top | P1 |
| Lockout | Progressive delay after failed attempts | P0 |
| Duress / panic wipe | Optional: wrong-PIN-N-times wipes vault | P2 |
| Tamper warning | Detect root / debugger and warn (not block) | P2 |
| Themes | Light, dark, AMOLED black, dynamic colour (Android 12+) | P1 |
| Localisation | English + Hindi strings from day one | P1 |

## Design system

Calm, monochrome-first UI with one accent colour, generous spacing and thumb-zone controls: everything you tap often sits in the bottom 40% of the screen.

**Layout**

- Designed at 360 × 800 dp first, scales up to tablets with a two-pane list/detail at ≥ 600 dp.
- 8 dp spacing grid; 16 dp screen gutters; list rows 64 dp; touch targets ≥ 48 dp.
- Bottom navigation with 3 tabs (Vault, Generator, Settings) + a floating "+" that opens Add / Smart Import.
- Search bar pinned at the top of Vault, collapses on scroll.

**Colour and type**

| Token | Light | Dark |
| --- | --- | --- |
| Background | #FAFAF9 | #0E0F11 (AMOLED: #000000) |
| Surface | #FFFFFF | #17191C |
| Text primary / secondary | #111214 / #5F6368 | #ECEDEE / #9AA0A6 |
| Accent | #3D5AFE (indigo) | #8C9EFF |
| Strength: weak / fair / strong | #D93025 / #F29900 / #188038 | #F28B82 / #FDD663 / #81C995 |

Type: Inter (bundled, no Google Fonts download) — 22 sp title, 16 sp body, 13 sp captions; monospace (JetBrains Mono) only for revealed passwords so `l`, `1` and `I` are distinguishable.

**Motion** (Compose `animate*AsState`, `AnimatedVisibility`, shared element transitions)

| Moment | Animation | Duration / easing |
| --- | --- | --- |
| Unlock success | Lock icon morphs open, vault list fades + rises 16 dp | 280 ms, emphasized decelerate |
| Wrong password | Field shakes 3× horizontally + haptic | 300 ms |
| List → detail | Shared element: avatar and title expand into header | 300 ms |
| Reveal password | Dots crossfade to characters | 150 ms |
| Copy | Button ticks to check, 30 s countdown ring drains | 200 ms + 30 s linear |
| Smart Import cards | Staggered slide-in, 40 ms apart; swipe to accept/discard with spring | spring, damping 0.8 |
| Strength meter | Bar width and colour tween as you type | 120 ms |
| Auto-lock | Content blurs, then lock screen fades in | 200 ms |

Respect the system "Remove animations" setting by checking the animator duration scale and dropping to instant transitions. Keep all motion under 300 ms except the clipboard ring.

## Screens and user flows

Twelve screens cover v1; the first-run flow takes under a minute and ends with the user's first Smart Import.

**First run**

1. Welcome — one line ("Your passwords never leave this phone") + "Get started".
2. Create master password — live strength meter; must reach zxcvbn score 3; confirm field; checkbox "I understand there is no recovery".
3. Enable biometrics (skippable).
4. Import choice — Smart Import paste, file import, or start empty.
5. Save first backup — file picker to a location of the user's choice (skippable, reminder later).

**Screens**

| Screen | Key elements |
| --- | --- |
| Lock | App mark, password field, biometric button, lockout timer when active |
| Vault | Search, filter chips (All, Logins, Cards, Notes, Favourites, Weak), list with letter avatars |
| Entry detail | Big title, copy buttons per field, reveal toggle, TOTP ring, history, edit |
| Add / edit entry | Type picker, fields, inline generator, strength meter |
| Smart Import — paste | Large text area, "Paste from clipboard", "Pick file", Analyse button |
| Smart Import — review | Summary bar (12 found · 9 ready · 3 check), swipeable cards, Accept all |
| Generator | Big result in monospace, regenerate, length slider, toggles, passphrase mode |
| Security audit | Score ring, lists of weak / reused / old, one-tap "Change" opens entry |
| Settings | Auto-lock, clipboard timeout, biometrics, theme, screenshots, import templates |
| Backup & restore | Create backup, restore, last-backup date, export formats |
| Recycle bin | Deleted entries with days left, restore / delete forever |
| About security | Plain-language threat model and the "no internet permission" proof |

**Everyday flow:** open app → biometric → type 2 letters in search → tap copy on password → app shows countdown ring → clipboard clears after 30 s → app auto-locks on leaving.

## Data model

Four Room tables; all secrets live inside one encrypted blob per entry, so the database reveals only counts and timestamps.

```kotlin
@Entity data class VaultMeta(
  @PrimaryKey val id: Int = 1,
  val formatVersion: Int,          // bump on any crypto change
  val kdf: String,                 // "argon2id"
  val kdfMemKiB: Int, val kdfIter: Int, val kdfPar: Int,
  val salt: ByteArray,
  val wrappedVaultKey: ByteArray,  // Keystore( PK( VK ) )
  val bioWrappedVaultKey: ByteArray?,
  val failedAttempts: Int, val lockoutUntil: Long
)

@Entity data class EntryRow(
  @PrimaryKey val id: String,      // UUID
  val searchToken: ByteArray,      // HMAC(VK, normalised name) prefix for fast lookup
  val sealed: ByteArray,           // AES-GCM(VK, nonce, EntryJson)
  val nonce: ByteArray,
  val createdAt: Long, val updatedAt: Long,
  val deletedAt: Long?             // recycle bin
)

@Entity data class HistoryRow(val entryId: String, val sealed: ByteArray, val nonce: ByteArray, val savedAt: Long)

@Entity data class ImportTemplate(val id: String, val pattern: String, val fieldOrder: String, val createdAt: Long)

// Decrypted, in memory only
data class EntryJson(
  val type: EntryType,             // LOGIN, CARD, BANK, WIFI, NOTE, IDENTITY
  val title: String, val username: String?, val password: CharArray?,
  val urls: List<String>, val pin: CharArray?, val totpSecret: CharArray?,
  val notes: String?, val tags: List<String>, val favourite: Boolean,
  val customFields: List<CustomField>, val source: String? // "smart-import", "manual"
)
```

Search decrypts the title list once at unlock into an in-memory index (cleared on lock), which keeps search under 50 ms without storing titles in clear.

## Testing and security checklist

The parser is tested like a compiler (hundreds of fixture inputs with expected outputs), and the app is checked against the OWASP MASVS categories before release.

**Smart Import tests**

- [ ] Golden corpus of 300+ real-world-style dumps (notes apps, WhatsApp forwards, Chrome CSV, Excel copy-paste, Hindi/English mixed labels), each with an expected JSON result.
- [ ] Target: ≥ 95% of fields correct on the corpus; zero cases of a password placed in a visible Notes field.
- [ ] Property tests: shuffled line order, extra whitespace, Windows line endings, emoji, 10,000-line input (no crash, < 2 s).

**Security tests**

- [ ] CI fails if the merged manifest contains `INTERNET`.
- [ ] Crypto known-answer tests for Argon2id and AES-GCM; tampered ciphertext must fail.
- [ ] Vault file copied to another phone cannot be opened, even with the correct password.
- [ ] Backup file restores on a fresh install with only the master password.
- [ ] Screenshots blank, Recents preview blank.
- [ ] Copied password hidden in keyboard clipboard preview; cleared after timeout.
- [ ] `adb backup` and Android cloud backup contain no vault data.
- [ ] No secrets in logcat (grep a full session log).
- [ ] Lockout persists after force-stop and reboot.
- [ ] R8 mapping kept privately; release build is non-debuggable.

**UX tests**

- [ ] TalkBack labels on every icon button; contrast ≥ 4.5:1.
- [ ] Font scale 200% does not clip text.
- [ ] Animations off: every flow still works.
- [ ] Cold start to lock screen < 600 ms on a 4 GB RAM phone.

## Build roadmap

&#91;embedded content: build roadmap · 5 phases, 4 gates\]

About 12 weeks for one experienced developer. Smart Import gets the longest slot because its accuracy is the product, and no phase starts until the previous gate passes.

## Refined build prompt

Copy this into a coding agent (Claude Code, Android Studio's assistant, or similar) and build one phase at a time.

```markdown
ROLE
You are a senior Android engineer and security engineer. Build a production-quality,
fully offline password manager app for Android, delivered as a signed release APK.

PRODUCT
Name: Vaultline. A local-only password vault with "Smart Import": the user pastes or
shares raw, messy text and the app classifies on its own which parts are account names,
usernames/emails/phones, passwords, PINs, URLs, 2FA secrets and notes — using only
deterministic rules (regex, dictionaries, weighted scoring). No AI, no ML, no OCR, no network.

HARD CONSTRAINTS
1. The merged AndroidManifest must contain NO android.permission.INTERNET and no network
   permissions. Add a Gradle check that fails the build if one appears.
2. No Google Play Services, Firebase, analytics, crash reporting, ads or remote fonts.
3. allowBackup=false and dataExtractionRules excluding all data.
4. minSdk 29, targetSdk latest stable. Kotlin + Jetpack Compose + Material 3, single Activity.
5. Secrets never in String, never logged; use CharArray/ByteArray and zero them on lock.

SECURITY ARCHITECTURE
- Random 256-bit Vault Key (VK) encrypts each entry with AES-256-GCM (fresh 12-byte nonce).
- Master password -> Argon2id (start m=64 MiB, t=3, p=1; benchmark and never go below
  m=19 MiB, t=2, p=1) -> Password Key, which wraps VK.
- That wrapped VK is wrapped again by a non-exportable Android Keystore AES-GCM key
  (StrongBox if available, unlockedDeviceRequired on API 28+).
- Bind format version and KDF params into GCM associated data.
- Optional biometric unlock via BiometricPrompt + CryptoObject on a second Keystore key;
  re-ask master password every 7 days.
- FLAG_SECURE on by default. Clipboard copies flagged with ClipDescription.EXTRA_IS_SENSITIVE
  and auto-cleared after 30 s. Auto-lock on background (configurable). Progressive lockout:
  5 failures -> 30 s, doubling to 30 min, persisted.
- Encrypted backup file (.vlbak, Argon2id + AES-GCM under master password only, Keystore-
  independent) via Storage Access Framework; restore on a fresh install.

SMART IMPORT ENGINE (pure Kotlin module :core-parser, fully unit tested)
Pipeline: normalise -> detect format (JSON / CSV with known headers from Chrome, Bitwarden,
LastPass, 1Password, KeePass / free text) -> split into records (blank line, heading line,
URL line, or a repeated label) -> extract "label separator value" pairs using a synonym table
(account/site/app; user/login/email/id/phone; pass/password/pwd/pw/passcode; pin/mpin;
url/link; note; 2fa/otp/secret) -> split unlabelled lines on 2+ spaces, tab, " / ", " | ",
" : ", "," -> score each token per field -> assign with constraints (max one account,
username, password, URL per record; positional prior account->username->password +0.10)
-> derive missing account names from the domain using a bundled Public Suffix List and a
bundled brand dictionary (~1,500 services incl. Indian banks/UPI apps) -> confidence per
record (>=0.80 auto, 0.55-0.79 check, <0.55 needs user) -> de-duplicate by (domain, username).
Scoring: label 0.98; email 0.95 username; URL/domain 0.95; brand dictionary 0.92 account;
phone 0.80 username; 4-6 digits 0.85 PIN; password = length 6-128, no spaces, >=3 char classes
0.85, +0.10 if Shannon entropy >=3.0 bits/char and not a dictionary word, +0.05 if zxcvbn
guesses >=1e6, -0.60 if it is an email or URL; handle-like token 0.70 username; Title Case
line 0.60 account; Base32 16-64 chars labelled 2fa 0.90 TOTP; 3+ words 0.70 notes.
Every score carries a human-readable reason shown in the review UI.
Review UI: swipeable cards per record, tap a field chip to reassign, drag tokens between
fields, "Accept all high-confidence", and "Apply to similar lines" which saves a deletable
local template. Raw input held in memory only and wiped after import.

FEATURES (v1)
Master password + biometric unlock; vault list with fuzzy search and filter chips; entry
types Login, Card, Bank/UPI, Wi-Fi, Secure note, Identity; password generator (random
8-128 chars and passphrase from a bundled word list); zxcvbn strength meter; secure copy;
auto-lock; screenshot block; encrypted backup/restore; Autofill Service; TOTP codes with
countdown ring; security audit (weak, reused, old >1 year); password history (10 versions);
recycle bin (30 days); KDBX 4 and CSV import/export; tags and favourites; light, dark,
AMOLED and dynamic colour themes; English + Hindi strings.

DESIGN
Mobile-first at 360x800 dp, 8 dp grid, 16 dp gutters, 48 dp min touch targets, primary
actions in the bottom 40% of the screen. Bottom nav: Vault, Generator, Settings + floating "+".
Minimal monochrome palette with one indigo accent; Inter for UI, JetBrains Mono for revealed
passwords (both bundled). Motion 150-300 ms with Material emphasized easing: unlock morph,
wrong-password shake + haptic, shared-element list->detail, staggered import cards, spring
swipes, strength bar tween, 30 s clipboard ring. Honour the system "remove animations" setting.
TalkBack labels, 4.5:1 contrast, works at 200% font scale.

ARCHITECTURE
Modules: :app, :feature-vault, :feature-import, :feature-generator, :feature-settings,
:core-crypto, :core-parser, :core-data (Room + SQLCipher or per-entry AES-GCM blobs),
:core-autofill. MVVM with StateFlow, Hilt DI, coroutines. R8 full mode, v2+ APK signing only,
reproducible build.

QUALITY BAR
- Parser: golden corpus of 300+ inputs with expected JSON; >=95% field accuracy; 10,000-line
  input under 2 s.
- Crypto known-answer tests; tampered data must fail; vault copied to another device must
  not open; backup restores on fresh install.
- Unlock < 1.5 s, search < 50 ms at 2,000 entries, cold start to lock screen < 600 ms.

DELIVERY
Work in phases: (1) project skeleton + crypto + lock screen, (2) Smart Import engine + tests,
(3) vault UI + entry types + generator, (4) autofill, TOTP, audit, backup, (5) hardening,
accessibility, release APK. After each phase, list files changed, how to run tests, and any
open decisions. Ask before adding any third-party dependency.
```
