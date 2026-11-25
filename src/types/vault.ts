export type EntryType = 'LOGIN' | 'CARD' | 'BANK' | 'WIFI' | 'NOTE' | 'IDENTITY';

export interface CustomField {
  id: string;
  label: string;
  value: string;
  sensitive: boolean;
}

export interface PasswordHistoryItem {
  password: string;
  savedAt: number;
}

export interface EntryJson {
  type: EntryType;
  title: string;
  username?: string;
  password?: string;
  urls: string[];
  pin?: string;
  totpSecret?: string;
  notes?: string;
  tags: string[];
  favourite: boolean;
  customFields: CustomField[];
  source?: 'smart-import' | 'csv-import' | 'manual';
  // Extended fields for specific entry types
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  cardHolder?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  upiId?: string;
  wifiSsid?: string;
  wifiSecurity?: 'WPA3' | 'WPA2' | 'WEP' | 'Open';
  identityFullName?: string;
  identityEmail?: string;
  identityPhone?: string;
  identityAddress?: string;
  identityDocNumber?: string;
}

export interface DecryptedEntry {
  id: string;
  data: EntryJson;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  history: PasswordHistoryItem[];
}

export interface EncryptedEntryRow {
  id: string;
  searchToken: string; // HMAC-SHA256 prefix (base64)
  sealed: string; // base64 ciphertext
  nonce: string; // base64 12-byte IV
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  history: Array<{
    sealed: string;
    nonce: string;
    savedAt: number;
  }>;
}

export type ThemeMode = 'light' | 'dark' | 'amoled';
export type LanguageCode = 'en' | 'hi';

export interface VaultSettings {
  autoLockSeconds: number; // 0 = immediate on blur, 30, 60, 300, -1 = never
  clipboardClearSeconds: number; // 15, 30, 60, 0 = off
  quickUnlockEnabled: boolean;
  privacyShieldEnabled: boolean; // Blur content when window loses focus
  theme: ThemeMode;
  language: LanguageCode;
  reduceAnimations: boolean;
  duressWipeAttempts: number; // 0 = disabled, e.g. 10 = wipe after 10 failures
  lastBackupAt: number | null;
  lastMasterPasswordCheckAt: number;
}

export interface ImportTemplate {
  id: string;
  name: string;
  delimiter: string;
  fieldOrder: SmartFieldRole[];
  createdAt: number;
}

export interface VaultMeta {
  id: 1;
  formatVersion: number;
  kdf: 'pbkdf2-sha256';
  kdfIterations: number;
  salt: string; // base64 16 bytes
  wrappedVaultKey: string; // base64 AES-GCM(PK, VK)
  wrappedVaultKeyNonce: string; // base64 12-byte IV
  deviceWrappedKey?: string; // base64 AES-GCM(DeviceKey, wrappedVaultKeyPayload)
  deviceWrappedKeyNonce?: string;
  quickUnlockWrappedKey?: string; // base64 AES-GCM(DeviceKey, VK)
  quickUnlockNonce?: string;
  failedAttempts: number;
  lockoutUntil: number;
  createdAt: number;
}

export interface VaultStorageBundle {
  meta: VaultMeta;
  entries: EncryptedEntryRow[];
  templates: ImportTemplate[];
  settings: VaultSettings;
}

// Smart Import types
export type SmartFieldRole =
  | 'account'
  | 'username'
  | 'password'
  | 'url'
  | 'pin'
  | 'totp'
  | 'notes';

export interface FieldCandidate {
  token: string;
  role: SmartFieldRole;
  score: number;
  reason: string;
}

export type ConfidenceTier = 'auto' | 'check' | 'needs-user';
export type DedupeAction = 'create' | 'update' | 'keep-both' | 'skip';

export interface ParsedRecord {
  id: string;
  rawLines: string[];
  tokens: string[];
  fields: Partial<Record<SmartFieldRole, FieldCandidate>>;
  extraNotes: string[];
  confidence: number;
  tier: ConfidenceTier;
  detectedType: EntryType;
  accepted: boolean;
  discarded: boolean;
  duplicateOfId?: string;
  duplicateOfTitle?: string;
  dedupeAction: DedupeAction;
}

export interface SmartImportResult {
  detectedFormat: 'json' | 'csv' | 'tsv' | 'freetext';
  records: ParsedRecord[];
  durationMs: number;
  lineCount: number;
}

export type AppRoute =
  | 'vault'
  | 'import'
  | 'generator'
  | 'audit'
  | 'settings'
  | 'backup'
  | 'recycle'
  | 'security';

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  entropyBitsPerChar: number;
  totalEntropyBits: number;
  estimatedGuesses: number;
  crackTimeDisplay: string;
  feedback: string[];
}
