import type {
  DecryptedEntry,
  ImportTemplate,
  VaultSettings,
  VaultStorageBundle,
} from '../types/vault';
import {
  clearDeviceKeystore,
  createVaultMeta,
  DEFAULT_KDF_ITERATIONS,
  generateUuid,
  sealEntry,
  unsealEntry,
} from './crypto';

const STORAGE_KEY = 'vaultline_vault_v1';

export const DEFAULT_SETTINGS: VaultSettings = {
  autoLockSeconds: 300,
  clipboardClearSeconds: 30,
  quickUnlockEnabled: false,
  privacyShieldEnabled: true,
  theme: 'light',
  language: 'en',
  reduceAnimations: false,
  duressWipeAttempts: 0,
  lastBackupAt: null,
  lastMasterPasswordCheckAt: Date.now(),
};

export function loadVaultBundle(): VaultStorageBundle | null {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultStorageBundle;
    if (!parsed?.meta || !Array.isArray(parsed.entries)) return null;
    return {
      ...parsed,
      templates: parsed.templates ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return null;
  }
}

export function saveVaultBundle(bundle: VaultStorageBundle): void {
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
}

export async function wipeEntireVault(): Promise<void> {
  globalThis.localStorage.removeItem(STORAGE_KEY);
  await clearDeviceKeystore();
}

export async function sealAllEntries(
  rawVaultKey: Uint8Array,
  entries: DecryptedEntry[]
) {
  return Promise.all(entries.map((entry) => sealEntry(rawVaultKey, entry)));
}

export async function unsealAllEntries(
  rawVaultKey: Uint8Array,
  bundle: VaultStorageBundle
): Promise<DecryptedEntry[]> {
  const results: DecryptedEntry[] = [];
  for (const row of bundle.entries) {
    try {
      results.push(await unsealEntry(rawVaultKey, row));
    } catch {
      // Ignore unreadable record
    }
  }
  return results;
}

export function createSampleEntries(): DecryptedEntry[] {
  const now = Date.now();
  const fourHundredDaysAgo = now - 400 * 24 * 60 * 60 * 1000;
  const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

  return [
    {
      id: generateUuid(),
      createdAt: tenDaysAgo,
      updatedAt: tenDaysAgo,
      deletedAt: null,
      history: [{ password: 'Gh$OldPass2024', savedAt: fourHundredDaysAgo }],
      data: {
        type: 'LOGIN',
        title: 'GitHub',
        username: 'ayu-builds',
        password: 'K9$mVz!29pQx#48rT',
        urls: ['https://github.com'],
        totpSecret: 'JBSWY3DPEHPK3PXP',
        notes: 'Primary engineering account with hardware passkey backup.',
        tags: ['work', 'dev'],
        favourite: true,
        customFields: [{ id: 'cf-1', label: 'Recovery hint', value: 'Offline USB key in safe', sensitive: false }],
        source: 'manual',
      },
    },
    {
      id: generateUuid(),
      createdAt: tenDaysAgo,
      updatedAt: tenDaysAgo,
      deletedAt: null,
      history: [],
      data: {
        type: 'BANK',
        title: 'SBI Net Banking',
        username: 'riyak88',
        password: 'Kx9!pLm2#88Qa',
        pin: '4821',
        bankAccountNumber: '38491029481',
        bankIfsc: 'SBIN0001928',
        upiId: 'riya@oksbi',
        urls: ['https://onlinesbi.sbi'],
        notes: 'Salary & savings account',
        tags: ['banking', 'upi'],
        favourite: true,
        customFields: [],
        source: 'smart-import',
      },
    },
    {
      id: generateUuid(),
      createdAt: fourHundredDaysAgo,
      updatedAt: fourHundredDaysAgo,
      deletedAt: null,
      history: [],
      data: {
        type: 'LOGIN',
        title: 'IRCTC',
        username: 'ayu_rail99',
        password: 'password123',
        urls: ['https://irctc.co.in'],
        notes: 'Old rail booking password (needs rotation)',
        tags: ['travel'],
        favourite: false,
        customFields: [],
        source: 'manual',
      },
    },
    {
      id: generateUuid(),
      createdAt: now - 3 * 24 * 60 * 60 * 1000,
      updatedAt: now - 3 * 24 * 60 * 60 * 1000,
      deletedAt: null,
      history: [],
      data: {
        type: 'WIFI',
        title: 'Home Fiber 5G',
        wifiSsid: 'Studio_Mesh_5G',
        password: 'password123',
        wifiSecurity: 'WPA3',
        urls: [],
        notes: 'Router admin at 192.168.1.1',
        tags: ['home'],
        favourite: false,
        customFields: [],
        source: 'manual',
      },
    },
    {
      id: generateUuid(),
      createdAt: now - 5 * 24 * 60 * 60 * 1000,
      updatedAt: now - 5 * 24 * 60 * 60 * 1000,
      deletedAt: null,
      history: [],
      data: {
        type: 'CARD',
        title: 'HDFC Regalia Card',
        cardHolder: 'Riya Kapoor',
        cardNumber: '4532 8910 3421 8842',
        cardExpiry: '09/29',
        cardCvv: '742',
        pin: '9042',
        urls: ['https://hdfcbank.com'],
        tags: ['banking'],
        favourite: false,
        customFields: [],
        source: 'manual',
      },
    },
    {
      id: generateUuid(),
      createdAt: now - 8 * 24 * 60 * 60 * 1000,
      updatedAt: now - 8 * 24 * 60 * 60 * 1000,
      deletedAt: null,
      history: [],
      data: {
        type: 'NOTE',
        title: 'PGP Offline Recovery Note',
        urls: [],
        notes: 'Paper backup stored in fireproof envelope #2. Fingerprint: 4F8A 9C21 E301 774B.',
        tags: ['recovery'],
        favourite: false,
        customFields: [],
        source: 'manual',
      },
    },
  ];
}

export async function bootstrapDemoVault(
  masterPassword: string = 'Vaultline#Demo2026',
  iterations: number = DEFAULT_KDF_ITERATIONS
): Promise<{
  bundle: VaultStorageBundle;
  rawVaultKey: Uint8Array;
  entries: DecryptedEntry[];
}> {
  const { meta, rawVaultKey } = await createVaultMeta(masterPassword, {
    iterations,
    enableQuickUnlock: true,
  });
  const entries = createSampleEntries();
  const sealedRows = await sealAllEntries(rawVaultKey, entries);
  const templates: ImportTemplate[] = [];
  const bundle: VaultStorageBundle = {
    meta,
    entries: sealedRows,
    templates,
    settings: { ...DEFAULT_SETTINGS, quickUnlockEnabled: true },
  };
  saveVaultBundle(bundle);
  return { bundle, rawVaultKey, entries };
}
