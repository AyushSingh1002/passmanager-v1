import type { DecryptedEntry, PasswordStrengthResult } from '../types/vault';
import { COMMON_WEAK_PASSWORDS, EFF_WORDLIST } from './wordlist';

const LOOKALIKES = new Set(['0', 'O', 'o', '1', 'l', 'I', '|']);

export interface RandomPasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeLookalikes: boolean;
}

export interface PassphraseOptions {
  wordCount: number;
  separator: '-' | '.' | ' ' | '_';
  capitalize: boolean;
  includeNumber: boolean;
}

function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const range = maxExclusive;
  const maxValid = Math.floor(0xffffffff / range) * range;
  const buf = new Uint32Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < maxValid) {
      return buf[0] % range;
    }
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateRandomPassword(options: RandomPasswordOptions): string {
  const length = Math.max(8, Math.min(128, Math.round(options.length)));

  const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
  const digitChars = '0123456789';
  const symbolChars = '!@#$%^&*-_=+?';

  const filterLookalikes = (chars: string) =>
    options.excludeLookalikes
      ? [...chars].filter((c) => !LOOKALIKES.has(c)).join('')
      : chars;

  const pools: string[] = [];
  if (options.uppercase) pools.push(filterLookalikes(upperChars));
  if (options.lowercase) pools.push(filterLookalikes(lowerChars));
  if (options.digits) pools.push(filterLookalikes(digitChars));
  if (options.symbols) pools.push(filterLookalikes(symbolChars));

  if (pools.length === 0) {
    pools.push(filterLookalikes(lowerChars), filterLookalikes(digitChars));
  }

  const combinedPool = pools.join('');
  const result: string[] = [];

  // Guarantee at least one character from each enabled class
  for (const pool of pools) {
    if (result.length < length && pool.length > 0) {
      result.push(pool[secureRandomInt(pool.length)]);
    }
  }

  while (result.length < length) {
    result.push(combinedPool[secureRandomInt(combinedPool.length)]);
  }

  return shuffleArray(result).join('');
}

export function generatePassphrase(options: PassphraseOptions): string {
  const count = Math.max(4, Math.min(8, Math.round(options.wordCount)));
  const words: string[] = [];

  for (let i = 0; i < count; i++) {
    let word = EFF_WORDLIST[secureRandomInt(EFF_WORDLIST.length)];
    if (options.capitalize) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }
    words.push(word);
  }

  if (options.includeNumber && words.length > 0) {
    const num = secureRandomInt(90) + 10;
    const idx = secureRandomInt(words.length);
    words[idx] = `${words[idx]}${num}`;
  }

  return words.join(options.separator);
}

export function calculateShannonEntropy(input: string): number {
  if (!input) return 0;
  const freq = new Map<string, number>();
  for (const ch of input) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  const len = input.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function isDictionaryWord(input: string): boolean {
  const lower = input.trim().toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lower)) return true;
  if (EFF_WORDLIST.includes(lower)) return true;
  const stripped = lower.replace(/[0-9!@#$%^&*]+$/g, '');
  return stripped.length >= 4 && (COMMON_WEAK_PASSWORDS.has(stripped) || EFF_WORDLIST.includes(stripped));
}

function hasSequentialPattern(pw: string): boolean {
  const lower = pw.toLowerCase();
  const sequences = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  for (const seq of sequences) {
    for (let i = 0; i <= seq.length - 4; i++) {
      if (lower.includes(seq.slice(i, i + 4))) return true;
    }
  }
  return false;
}

function hasRepeatedChars(pw: string): boolean {
  return /(.)\1{2,}/.test(pw);
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      score: 0,
      label: 'Very weak',
      entropyBitsPerChar: 0,
      totalEntropyBits: 0,
      estimatedGuesses: 0,
      crackTimeDisplay: 'Instant',
      feedback: ['Enter a password to evaluate strength'],
    };
  }

  const lower = password.toLowerCase();
  const entropyBitsPerChar = calculateShannonEntropy(password);
  const feedback: string[] = [];

  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9\s]/.test(password)) charsetSize += 32;
  if (/\s/.test(password)) charsetSize += 1;

  // Estimate effective search space with penalties for patterns/dictionary words
  let effectiveLength = password.length;
  const isCommon = COMMON_WEAK_PASSWORDS.has(lower);
  const isDict = isDictionaryWord(password);

  if (isCommon) {
    effectiveLength = Math.min(effectiveLength, 2);
    feedback.push('Top commonly breached password — avoid immediately');
  } else if (isDict) {
    effectiveLength = Math.max(2, effectiveLength * 0.45);
    feedback.push('Resembles a single dictionary word with predictable suffix');
  }

  if (hasSequentialPattern(password)) {
    effectiveLength = Math.max(2, effectiveLength - 3);
    feedback.push('Avoid sequential keys or numbers like 1234 or qwerty');
  }
  if (hasRepeatedChars(password)) {
    effectiveLength = Math.max(2, effectiveLength - 2);
    feedback.push('Repeated characters reduce unpredictability');
  }
  if (/^(19|20)\d{2}$/.test(password) || /(19|20)\d{2}/.test(password)) {
    effectiveLength = Math.max(2, effectiveLength - 2);
    feedback.push('Avoid years or calendar dates');
  }

  const totalEntropyBits = Math.max(0, effectiveLength * Math.log2(Math.max(2, charsetSize)));
  const estimatedGuesses = isCommon ? 100 : Math.pow(2, Math.min(80, totalEntropyBits));

  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (isCommon || password.length < 6 || estimatedGuesses < 1e4) {
    score = 0;
  } else if (estimatedGuesses < 1e6 || password.length < 8) {
    score = 1;
  } else if (estimatedGuesses < 1e8 || password.length < 10) {
    score = 2;
  } else if (estimatedGuesses < 1e11) {
    score = 3;
  } else {
    score = 4;
  }

  if (password.length < 12 && score < 4) {
    feedback.push('Use 12+ characters or 4+ random passphrase words');
  }
  if (charsetSize <= 26 && password.length < 16) {
    feedback.push('Mix uppercase, digits, or symbols to widen the keyspace');
  }
  if (feedback.length === 0) {
    feedback.push(score === 4 ? 'High entropy and resistant to offline guessing' : 'Good length and character diversity');
  }

  const labels: Record<0 | 1 | 2 | 3 | 4, PasswordStrengthResult['label']> = {
    0: 'Very weak',
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong',
  };

  let crackTimeDisplay = 'Instant';
  if (estimatedGuesses >= 1e15) crackTimeDisplay = 'Centuries';
  else if (estimatedGuesses >= 1e12) crackTimeDisplay = 'Years';
  else if (estimatedGuesses >= 1e9) crackTimeDisplay = 'Months';
  else if (estimatedGuesses >= 1e7) crackTimeDisplay = 'Days';
  else if (estimatedGuesses >= 1e5) crackTimeDisplay = 'Hours';
  else if (estimatedGuesses >= 1e3) crackTimeDisplay = 'Minutes';

  return {
    score,
    label: labels[score],
    entropyBitsPerChar: Number(entropyBitsPerChar.toFixed(2)),
    totalEntropyBits: Number(totalEntropyBits.toFixed(1)),
    estimatedGuesses,
    crackTimeDisplay,
    feedback,
  };
}

export interface AuditReport {
  overallScore: number; // 0..100
  weakEntries: Array<{ entry: DecryptedEntry; strength: PasswordStrengthResult }>;
  reusedGroups: Array<{ passwordMask: string; entries: DecryptedEntry[] }>;
  oldEntries: Array<{ entry: DecryptedEntry; ageDays: number }>;
  totalWithPasswords: number;
}

export function runSecurityAudit(entries: DecryptedEntry[], nowMs = Date.now()): AuditReport {
  const active = entries.filter((e) => e.deletedAt === null);
  const weakEntries: AuditReport['weakEntries'] = [];
  const oldEntries: AuditReport['oldEntries'] = [];
  const passwordBuckets = new Map<string, DecryptedEntry[]>();

  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  let totalWithPasswords = 0;

  for (const entry of active) {
    const pw = entry.data.password;
    if (!pw || pw.length === 0) continue;
    totalWithPasswords++;

    const strength = evaluatePasswordStrength(pw);
    if (strength.score <= 2) {
      weakEntries.push({ entry, strength });
    }

    const list = passwordBuckets.get(pw) ?? [];
    list.push(entry);
    passwordBuckets.set(pw, list);

    const ageMs = nowMs - entry.updatedAt;
    if (ageMs > ONE_YEAR_MS) {
      oldEntries.push({ entry, ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)) });
    }
  }

  const reusedGroups: AuditReport['reusedGroups'] = [];
  for (const [pw, group] of passwordBuckets.entries()) {
    if (group.length > 1) {
      const mask = pw.length <= 2 ? '••' : `${pw[0]}${'•'.repeat(Math.min(6, pw.length - 2))}${pw[pw.length - 1]}`;
      reusedGroups.push({ passwordMask: mask, entries: group });
    }
  }

  let overallScore = 100;
  if (totalWithPasswords > 0) {
    const weakPenalty = (weakEntries.length / totalWithPasswords) * 45;
    const reusedCount = reusedGroups.reduce((acc, g) => acc + g.entries.length, 0);
    const reusedPenalty = (reusedCount / totalWithPasswords) * 40;
    const oldPenalty = (oldEntries.length / totalWithPasswords) * 15;
    overallScore = Math.max(0, Math.round(100 - weakPenalty - reusedPenalty - oldPenalty));
  }

  return {
    overallScore,
    weakEntries,
    reusedGroups,
    oldEntries,
    totalWithPasswords,
  };
}
