import type {
  DecryptedEntry,
  EncryptedEntryRow,
  EntryJson,
  PasswordHistoryItem,
  VaultMeta,
} from '../types/vault';

export const VAULT_FORMAT_VERSION = 1;
export const DEFAULT_KDF_ITERATIONS = 310_000;

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function wipeBytes(bytes: Uint8Array | null | undefined): void {
  if (!bytes) return;
  bytes.fill(0);
}

export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function generateUuid(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = generateRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildKdfAad(version: number, kdf: string, iterations: number, purpose: string): Uint8Array {
  return new TextEncoder().encode(`vaultline|v${version}|${kdf}|${iterations}|${purpose}`);
}

export async function derivePasswordKey(
  masterPassword: string,
  salt: Uint8Array,
  iterations: number = DEFAULT_KDF_ITERATIONS
): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(masterPassword);
  try {
    const baseKey = await globalThis.crypto.subtle.importKey(
      'raw',
      toArrayBuffer(passwordBytes),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return await globalThis.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: toArrayBuffer(salt),
        iterations,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } finally {
    wipeBytes(passwordBytes);
  }
}

export async function generateVaultKey(): Promise<Uint8Array> {
  return generateRandomBytes(32);
}

export async function importVaultKeyForAes(rawVk: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(rawVk),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const nonce = generateRandomBytes(12);
  const encrypted = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
    },
    key,
    toArrayBuffer(plaintext)
  );
  return { ciphertext: new Uint8Array(encrypted), nonce };
}

export async function aesGcmDecrypt(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  aad?: Uint8Array
): Promise<Uint8Array> {
  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
    },
    key,
    toArrayBuffer(ciphertext)
  );
  return new Uint8Array(decrypted);
}

// IndexedDB non-extractable device keystore key (analogous to Android Keystore hardware wrap)
const KEYSTORE_DB = 'vaultline_keystore';
const KEYSTORE_STORE = 'keys';
const DEVICE_KEY_ID = 'device_master_wrap_v1';

let fallbackInMemoryDeviceKey: CryptoKey | null = null;

async function openKeystoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(KEYSTORE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(KEYSTORE_STORE)) {
        req.result.createObjectStore(KEYSTORE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getOrCreateDeviceKey(overrideKey?: CryptoKey): Promise<CryptoKey> {
  if (overrideKey) return overrideKey;

  if (typeof globalThis.indexedDB === 'undefined') {
    if (!fallbackInMemoryDeviceKey) {
      fallbackInMemoryDeviceKey = await globalThis.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    }
    return fallbackInMemoryDeviceKey;
  }

  const db = await openKeystoreDb();
  try {
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(KEYSTORE_STORE, 'readonly');
      const req = tx.objectStore(KEYSTORE_STORE).get(DEVICE_KEY_ID);
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
      req.onerror = () => reject(req.error);
    });
    if (existing) return existing;

    const created = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEYSTORE_STORE, 'readwrite');
      const req = tx.objectStore(KEYSTORE_STORE).put(created, DEVICE_KEY_ID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return created;
  } finally {
    db.close();
  }
}

export async function clearDeviceKeystore(): Promise<void> {
  fallbackInMemoryDeviceKey = null;
  if (typeof globalThis.indexedDB === 'undefined') return;
  const db = await openKeystoreDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEYSTORE_STORE, 'readwrite');
      const req = tx.objectStore(KEYSTORE_STORE).delete(DEVICE_KEY_ID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function createVaultMeta(
  masterPassword: string,
  options?: {
    iterations?: number;
    enableQuickUnlock?: boolean;
    deviceKey?: CryptoKey;
  }
): Promise<{ meta: VaultMeta; rawVaultKey: Uint8Array }> {
  const iterations = options?.iterations ?? DEFAULT_KDF_ITERATIONS;
  const salt = generateRandomBytes(16);
  const rawVaultKey = await generateVaultKey();
  const pk = await derivePasswordKey(masterPassword, salt, iterations);
  const aad = buildKdfAad(VAULT_FORMAT_VERSION, 'pbkdf2-sha256', iterations, 'vk-wrap');

  const wrappedByPk = await aesGcmEncrypt(pk, rawVaultKey, aad);

  // Outer hardware/device keystore wrap of wrappedVaultKey
  const deviceKey = await getOrCreateDeviceKey(options?.deviceKey);
  const deviceWrapped = await aesGcmEncrypt(deviceKey, wrappedByPk.ciphertext, aad);

  let quickUnlockWrappedKey: string | undefined;
  let quickUnlockNonce: string | undefined;
  if (options?.enableQuickUnlock) {
    const quick = await aesGcmEncrypt(deviceKey, rawVaultKey, buildKdfAad(VAULT_FORMAT_VERSION, 'device', 0, 'quick-unlock'));
    quickUnlockWrappedKey = bytesToBase64(quick.ciphertext);
    quickUnlockNonce = bytesToBase64(quick.nonce);
  }

  const meta: VaultMeta = {
    id: 1,
    formatVersion: VAULT_FORMAT_VERSION,
    kdf: 'pbkdf2-sha256',
    kdfIterations: iterations,
    salt: bytesToBase64(salt),
    wrappedVaultKey: bytesToBase64(wrappedByPk.ciphertext),
    wrappedVaultKeyNonce: bytesToBase64(wrappedByPk.nonce),
    deviceWrappedKey: bytesToBase64(deviceWrapped.ciphertext),
    deviceWrappedKeyNonce: bytesToBase64(deviceWrapped.nonce),
    quickUnlockWrappedKey,
    quickUnlockNonce,
    failedAttempts: 0,
    lockoutUntil: 0,
    createdAt: Date.now(),
  };

  return { meta, rawVaultKey };
}

export async function unlockVaultWithPassword(
  meta: VaultMeta,
  masterPassword: string,
  deviceKeyOverride?: CryptoKey
): Promise<Uint8Array> {
  const salt = base64ToBytes(meta.salt);
  const aad = buildKdfAad(meta.formatVersion, meta.kdf, meta.kdfIterations, 'vk-wrap');

  let innerCiphertext: Uint8Array;
  if (meta.deviceWrappedKey && meta.deviceWrappedKeyNonce) {
    const deviceKey = await getOrCreateDeviceKey(deviceKeyOverride);
    innerCiphertext = await aesGcmDecrypt(
      deviceKey,
      base64ToBytes(meta.deviceWrappedKey),
      base64ToBytes(meta.deviceWrappedKeyNonce),
      aad
    );
  } else {
    innerCiphertext = base64ToBytes(meta.wrappedVaultKey);
  }

  const pk = await derivePasswordKey(masterPassword, salt, meta.kdfIterations);
  const rawVk = await aesGcmDecrypt(
    pk,
    innerCiphertext,
    base64ToBytes(meta.wrappedVaultKeyNonce),
    aad
  );
  return rawVk;
}

export async function unlockVaultWithQuickDeviceKey(
  meta: VaultMeta,
  deviceKeyOverride?: CryptoKey
): Promise<Uint8Array> {
  if (!meta.quickUnlockWrappedKey || !meta.quickUnlockNonce) {
    throw new Error('Quick unlock is not enabled');
  }
  const deviceKey = await getOrCreateDeviceKey(deviceKeyOverride);
  const aad = buildKdfAad(meta.formatVersion, 'device', 0, 'quick-unlock');
  return aesGcmDecrypt(
    deviceKey,
    base64ToBytes(meta.quickUnlockWrappedKey),
    base64ToBytes(meta.quickUnlockNonce),
    aad
  );
}

export async function enableQuickUnlockOnMeta(
  meta: VaultMeta,
  rawVaultKey: Uint8Array,
  enable: boolean,
  deviceKeyOverride?: CryptoKey
): Promise<VaultMeta> {
  if (!enable) {
    const next = { ...meta };
    delete next.quickUnlockWrappedKey;
    delete next.quickUnlockNonce;
    return next;
  }
  const deviceKey = await getOrCreateDeviceKey(deviceKeyOverride);
  const aad = buildKdfAad(meta.formatVersion, 'device', 0, 'quick-unlock');
  const quick = await aesGcmEncrypt(deviceKey, rawVaultKey, aad);
  return {
    ...meta,
    quickUnlockWrappedKey: bytesToBase64(quick.ciphertext),
    quickUnlockNonce: bytesToBase64(quick.nonce),
  };
}

export async function computeSearchToken(rawVaultKey: Uint8Array, normalizedTitle: string): Promise<string> {
  const hmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(rawVaultKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const msg = new TextEncoder().encode(normalizedTitle.trim().toLowerCase());
  const sig = await globalThis.crypto.subtle.sign('HMAC', hmacKey, toArrayBuffer(msg));
  return bytesToBase64(new Uint8Array(sig).subarray(0, 12));
}

export async function sealEntry(
  rawVaultKey: Uint8Array,
  entry: DecryptedEntry
): Promise<EncryptedEntryRow> {
  const aesKey = await importVaultKeyForAes(rawVaultKey);
  const payload = new TextEncoder().encode(JSON.stringify(entry.data));
  const aad = new TextEncoder().encode(`entry|${entry.id}`);
  const { ciphertext, nonce } = await aesGcmEncrypt(aesKey, payload, aad);
  wipeBytes(payload);

  const encryptedHistory = await Promise.all(
    entry.history.slice(0, 10).map(async (h) => {
      const hBytes = new TextEncoder().encode(JSON.stringify(h));
      const sealedH = await aesGcmEncrypt(aesKey, hBytes, aad);
      wipeBytes(hBytes);
      return {
        sealed: bytesToBase64(sealedH.ciphertext),
        nonce: bytesToBase64(sealedH.nonce),
        savedAt: h.savedAt,
      };
    })
  );

  const searchToken = await computeSearchToken(rawVaultKey, entry.data.title);

  return {
    id: entry.id,
    searchToken,
    sealed: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    history: encryptedHistory,
  };
}

export async function unsealEntry(
  rawVaultKey: Uint8Array,
  row: EncryptedEntryRow
): Promise<DecryptedEntry> {
  const aesKey = await importVaultKeyForAes(rawVaultKey);
  const aad = new TextEncoder().encode(`entry|${row.id}`);
  const plainBytes = await aesGcmDecrypt(
    aesKey,
    base64ToBytes(row.sealed),
    base64ToBytes(row.nonce),
    aad
  );
  const data = JSON.parse(new TextDecoder().decode(plainBytes)) as EntryJson;
  wipeBytes(plainBytes);

  const history: PasswordHistoryItem[] = [];
  for (const h of row.history ?? []) {
    try {
      const hBytes = await aesGcmDecrypt(
        aesKey,
        base64ToBytes(h.sealed),
        base64ToBytes(h.nonce),
        aad
      );
      history.push(JSON.parse(new TextDecoder().decode(hBytes)) as PasswordHistoryItem);
      wipeBytes(hBytes);
    } catch {
      // Skip corrupted history item
    }
  }

  return {
    id: row.id,
    data,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    history,
  };
}

// Portable Keystore-independent .vlbak backup format (Argon2/PBKDF2 + AES-256-GCM under master password only)
export interface VlbakEnvelope {
  magic: 'VAULTLINE_BAK_V1';
  formatVersion: number;
  kdf: 'pbkdf2-sha256';
  kdfIterations: number;
  salt: string;
  nonce: string;
  ciphertext: string;
  exportedAt: number;
}

export async function exportEncryptedVlbak(
  masterPassword: string,
  entries: DecryptedEntry[],
  iterations: number = DEFAULT_KDF_ITERATIONS
): Promise<VlbakEnvelope> {
  const salt = generateRandomBytes(16);
  const pk = await derivePasswordKey(masterPassword, salt, iterations);
  const aad = buildKdfAad(VAULT_FORMAT_VERSION, 'pbkdf2-sha256', iterations, 'vlbak');
  const plain = new TextEncoder().encode(
    JSON.stringify({
      formatVersion: VAULT_FORMAT_VERSION,
      exportedAt: Date.now(),
      entries,
    })
  );
  const { ciphertext, nonce } = await aesGcmEncrypt(pk, plain, aad);
  wipeBytes(plain);

  return {
    magic: 'VAULTLINE_BAK_V1',
    formatVersion: VAULT_FORMAT_VERSION,
    kdf: 'pbkdf2-sha256',
    kdfIterations: iterations,
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
    exportedAt: Date.now(),
  };
}

export async function importEncryptedVlbak(
  masterPassword: string,
  envelope: VlbakEnvelope
): Promise<DecryptedEntry[]> {
  if (envelope.magic !== 'VAULTLINE_BAK_V1') {
    throw new Error('Invalid Vaultline backup file format');
  }
  const salt = base64ToBytes(envelope.salt);
  const pk = await derivePasswordKey(masterPassword, salt, envelope.kdfIterations);
  const aad = buildKdfAad(envelope.formatVersion, envelope.kdf, envelope.kdfIterations, 'vlbak');
  const plain = await aesGcmDecrypt(
    pk,
    base64ToBytes(envelope.ciphertext),
    base64ToBytes(envelope.nonce),
    aad
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as { entries: DecryptedEntry[] };
  wipeBytes(plain);
  return parsed.entries ?? [];
}

// Progressive lockout calculation: 5 fails -> 30s, doubling up to 30m cap
export function calculateLockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  const exponent = failedAttempts - 5;
  const seconds = Math.min(30 * 60, 30 * Math.pow(2, exponent));
  return seconds * 1000;
}

// RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30-second period)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function decodeBase32(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s\-=]+/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error('Invalid Base32 TOTP secret');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export async function generateTotpCode(
  base32Secret: string,
  timestampMs: number = Date.now(),
  periodSeconds: number = 30,
  digits: number = 6
): Promise<{ code: string; remainingSeconds: number; periodSeconds: number }> {
  const keyBytes = decodeBase32(base32Secret);
  if (keyBytes.length === 0) {
    throw new Error('Empty TOTP secret');
  }
  const epochSeconds = Math.floor(timestampMs / 1000);
  const counter = Math.floor(epochSeconds / periodSeconds);
  const remainingSeconds = periodSeconds - (epochSeconds % periodSeconds);

  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const hmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', hmacKey, counterBuf));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return {
    code: otp.toString().padStart(digits, '0'),
    remainingSeconds,
    periodSeconds,
  };
}
