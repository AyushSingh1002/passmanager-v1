import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSmartImport, reassignParsedRecordField } from './parser';
import type { DecryptedEntry } from '../types/vault';

test('Smart Import handles worked example from blueprint accurately', () => {
  const input = `Insta
@riya.k  Sunflower#2291

SBI net banking - user: riyak88 pwd: Kx9!pLm2
mpin 4821`;

  const result = parseSmartImport(input);
  assert.equal(result.detectedFormat, 'freetext');
  assert.equal(result.records.length, 2);

  const r1 = result.records[0];
  assert.equal(r1.fields.account?.token, 'Instagram');
  assert.equal(r1.fields.username?.token, '@riya.k');
  assert.equal(r1.fields.password?.token, 'Sunflower#2291');
  assert.equal(r1.tier, 'auto');
  assert.ok(r1.confidence >= 0.8);

  const r2 = result.records[1];
  assert.equal(r2.fields.account?.token, 'SBI');
  assert.equal(r2.fields.username?.token, 'riyak88');
  assert.equal(r2.fields.password?.token, 'Kx9!pLm2');
  assert.equal(r2.fields.pin?.token, '4821');
  assert.equal(r2.detectedType, 'BANK');
  assert.equal(r2.tier, 'auto');
});

test('Smart Import derives missing account name from URL or email via PSL', () => {
  const input = `accounts.google.com
riya.kapoor@gmail.com
Tr!ckyPass99`;

  const result = parseSmartImport(input);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].fields.account?.token, 'Google');
  assert.equal(result.records[0].fields.username?.token, 'riya.kapoor@gmail.com');
  assert.equal(result.records[0].fields.password?.token, 'Tr!ckyPass99');
});

test('Smart Import detects Chrome/Bitwarden CSV format and handles deduplication', () => {
  const csv = `name,url,username,password
GitHub,https://github.com,ayu-dev,Gh$9821Lk!
HDFC Bank,https://netbanking.hdfcbank.com,9876543210,HdFc@2026#9`;

  const existing: DecryptedEntry[] = [
    {
      id: 'existing-1',
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
      history: [],
      data: {
        type: 'LOGIN',
        title: 'GitHub',
        username: 'ayu-dev',
        password: 'old-password',
        urls: ['https://github.com'],
        tags: [],
        favourite: false,
        customFields: [],
      },
    },
  ];

  const result = parseSmartImport(csv, existing);
  assert.equal(result.detectedFormat, 'csv');
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].duplicateOfId, 'existing-1');
  assert.equal(result.records[0].dedupeAction, 'update');
  assert.equal(result.records[1].duplicateOfId, undefined);
  assert.equal(result.records[1].dedupeAction, 'create');
});

test('Smart Import segments repeated labels and extracts 2FA Base32 secrets', () => {
  const input = `site: Cloudflare
email: ops@example.in
password: Cf!9201xYz#
2fa: JBSWY3DPEHPK3PXP
site: IRCTC
user: ayu_rail
pwd: Rail#4482!Kp`;

  const result = parseSmartImport(input);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].fields.account?.token, 'Cloudflare');
  assert.equal(result.records[0].fields.totp?.token, 'JBSWY3DPEHPK3PXP');
  assert.equal(result.records[1].fields.account?.token, 'IRCTC');
  assert.equal(result.records[1].fields.username?.token, 'ayu_rail');
});

test('Smart Import manual field reassignment swaps cleanly and preserves deterministic stress performance', () => {
  const res = parseSmartImport('MyCustomApp / alphaUser / Zx9!kL2@p');
  assert.equal(res.records.length, 1);
  const reassigned = reassignParsedRecordField(res.records[0], 'username', 'account');
  assert.equal(reassigned.fields.account?.token, 'alphaUser');
  assert.equal(reassigned.fields.username?.token, 'MyCustomApp');

  // 10,000-line stress test (< 2000ms)
  const block = 'github.com\nuser@example.com\nStr0ng!Pass#92\n\n';
  const bigInput = block.repeat(2500); // 10,000 lines
  const stress = parseSmartImport(bigInput);
  assert.equal(stress.records.length, 2500);
  assert.ok(stress.durationMs < 2000, `Expected <2000ms, got ${stress.durationMs}ms`);
});
