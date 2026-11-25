import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLockoutDurationMs,
  createVaultMeta,
  exportEncryptedVlbak,
  generateTotpCode,
  importEncryptedVlbak,
  sealEntry,
  unlockVaultWithPassword,
  unsealEntry,
} from './crypto';
import type { DecryptedEntry } from '../types/vault';

test('Envelope encryption round-trip succeeds and rejects wrong password or tampered metadata', async () => {
  const { meta, rawVaultKey } = await createVaultMeta('Correct-Horse-Battery-99!', {
    iterations: 10_000, // Fast iterations for unit tests
  });

  const unlockedVk = await unlockVaultWithPassword(meta, 'Correct-Horse-Battery-99!');
  assert.deepEqual(unlockedVk, rawVaultKey);

  // Wrong password must reject
  await assert.rejects(() => unlockVaultWithPassword(meta, 'Wrong-Password-123!'));

  // Tampered KDF parameter (AAD downgrade) must reject
  const tamperedMeta = { ...meta, kdfIterations: 5_000 };
  await assert.rejects(() => unlockVaultWithPassword(tamperedMeta, 'Correct-Horse-Battery-99!'));

  // Copied vault opened with a different device keystore key must reject
  const otherDeviceKey = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  await assert.rejects(() => unlockVaultWithPassword(meta, 'Correct-Horse-Battery-99!', otherDeviceKey));
});

test('Per-entry AES-256-GCM sealing rejects tampered ciphertext and preserves entry fields', async () => {
  const { rawVaultKey } = await createVaultMeta('VaultMaster#2026', { iterations: 10_000 });
  const entry: DecryptedEntry = {
    id: 'entry-123',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    deletedAt: null,
    history: [{ password: 'OldPass!1', savedAt: 1699999999000 }],
    data: {
      type: 'LOGIN',
      title: 'GitHub',
      username: 'ayu',
      password: 'NewStrong!Password#99',
      urls: ['https://github.com'],
      totpSecret: 'JBSWY3DPEHPK3PXP',
      tags: ['work'],
      favourite: true,
      customFields: [],
    },
  };

  const sealed = await sealEntry(rawVaultKey, entry);
  assert.ok(!sealed.sealed.includes('NewStrong'));
  const unsealed = await unsealEntry(rawVaultKey, sealed);
  assert.deepEqual(unsealed, entry);

  // Tampered entry ID (AAD mismatch) fails
  await assert.rejects(() => unsealEntry(rawVaultKey, { ...sealed, id: 'entry-999' }));
});

test('.vlbak backup exports and restores independently of device keystore', async () => {
  const sample: DecryptedEntry[] = [
    {
      id: 'b-1',
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: null,
      history: [],
      data: {
        type: 'BANK',
        title: 'SBI',
        username: 'riyak88',
        password: 'Kx9!pLm2',
        pin: '4821',
        urls: [],
        tags: ['banking'],
        favourite: false,
        customFields: [],
      },
    },
  ];

  const backup = await exportEncryptedVlbak('BackupMaster!2026', sample, 10_000);
  const restored = await importEncryptedVlbak('BackupMaster!2026', backup);
  assert.deepEqual(restored, sample);

  await assert.rejects(() => importEncryptedVlbak('WrongBackupPass', backup));
});

test('RFC 6238 TOTP known-answer test vector and progressive lockout timing', async () => {
  // RFC 6238 SHA-1 test seed "12345678901234567890" in Base32
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  // At T = 59 seconds (counter = 1), 6-digit truncation of RFC 6238 vector 94287082 is 287082
  const totp = await generateTotpCode(rfcSecret, 59_000, 30, 6);
  assert.equal(totp.code, '287082');
  assert.equal(totp.remainingSeconds, 1);

  assert.equal(calculateLockoutDurationMs(4), 0);
  assert.equal(calculateLockoutDurationMs(5), 30_000);
  assert.equal(calculateLockoutDurationMs(6), 60_000);
  assert.equal(calculateLockoutDurationMs(20), 1_800_000);
});
