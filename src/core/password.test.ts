import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePasswordStrength,
  generatePassphrase,
  generateRandomPassword,
  runSecurityAudit,
} from './password';
import type { DecryptedEntry } from '../types/vault';

test('Random password generator obeys length and look-alike exclusion', () => {
  const pw = generateRandomPassword({
    length: 24,
    uppercase: true,
    lowercase: true,
    digits: true,
    symbols: true,
    excludeLookalikes: true,
  });
  assert.equal(pw.length, 24);
  assert.equal(/[0Oo1lI|]/.test(pw), false);
});

test('Passphrase generator produces requested word count from bundled wordlist', () => {
  const phrase = generatePassphrase({
    wordCount: 5,
    separator: '-',
    capitalize: true,
    includeNumber: false,
  });
  assert.equal(phrase.split('-').length, 5);
});

test('Strength meter flags weak common passwords and rewards high-entropy passphrases', () => {
  const weak = evaluatePasswordStrength('password123');
  assert.equal(weak.score, 0);

  const strong = evaluatePasswordStrength('K9$mVz!29pQx#48rT');
  assert.ok(strong.score >= 3);
});

test('Security audit detects weak, reused, and >1 year old passwords', () => {
  const now = Date.now();
  const twoYearsAgo = now - 400 * 24 * 60 * 60 * 1000;
  const entries: DecryptedEntry[] = [
    {
      id: '1',
      createdAt: twoYearsAgo,
      updatedAt: twoYearsAgo,
      deletedAt: null,
      history: [],
      data: {
        type: 'LOGIN',
        title: 'Site A',
        username: 'a',
        password: 'password123',
        urls: [],
        tags: [],
        favourite: false,
        customFields: [],
      },
    },
    {
      id: '2',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      history: [],
      data: {
        type: 'LOGIN',
        title: 'Site B',
        username: 'b',
        password: 'password123',
        urls: [],
        tags: [],
        favourite: false,
        customFields: [],
      },
    },
  ];

  const report = runSecurityAudit(entries, now);
  assert.equal(report.weakEntries.length, 2);
  assert.equal(report.reusedGroups.length, 1);
  assert.equal(report.oldEntries.length, 1);
  assert.ok(report.overallScore < 50);
});
