import type {
  ConfidenceTier,
  DecryptedEntry,
  EntryType,
  FieldCandidate,
  ImportTemplate,
  ParsedRecord,
  SmartFieldRole,
  SmartImportResult,
} from '../types/vault';
import {
  deriveAccountTitleFromDomain,
  extractHostname,
  getRegistrableDomain,
  isLikelyUrlOrDomain,
  matchBrandByDomain,
  matchBrandByText,
} from './brandDictionary';
import { calculateShannonEntropy, evaluatePasswordStrength, isDictionaryWord } from './password';

const LABEL_SYNONYMS: Record<SmartFieldRole, string[]> = {
  account: ['account', 'site', 'app', 'service', 'website', 'platform', 'portal', 'bank', 'title', 'name', 'khata', 'खाता'],
  username: ['user', 'username', 'user name', 'login', 'id', 'user id', 'userid', 'email', 'e-mail', 'mail', 'phone', 'mobile', 'mob', 'handle', 'customer id', 'cif', 'यूजर', 'ईमेल'],
  password: ['pass', 'password', 'pwd', 'pw', 'pswd', 'passcode', 'passphrase', 'key', 'secret key', 'पासवर्ड'],
  pin: ['pin', 'mpin', 'm-pin', 'upi pin', 'tpin', 'atm pin', 'पिन'],
  url: ['url', 'link', 'web', 'uri', 'domain', 'homepage', 'website url'],
  totp: ['2fa', 'otp', 'totp', 'secret', '2fa secret', 'auth key', 'backup code', 'authenticator'],
  notes: ['note', 'notes', 'hint', 'remark', 'remarks', 'memo', 'info', 'comment', 'नोट'],
};

const LABEL_TO_ROLE = new Map<string, SmartFieldRole>();
for (const [role, synonyms] of Object.entries(LABEL_SYNONYMS) as Array<[SmartFieldRole, string[]]>) {
  for (const s of synonyms) {
    LABEL_TO_ROLE.set(s.toLowerCase(), role);
  }
}

const ALL_SYNONYMS_SORTED = Array.from(LABEL_TO_ROLE.keys()).sort((a, b) => b.length - a.length);
const LABEL_PATTERN_STR = ALL_SYNONYMS_SORTED.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const INLINE_SCAN_REGEX_SOURCE = `(^|\\s|-\\s)(${LABEL_PATTERN_STR})(\\s*[:=–—>]\\s*|\\s+(?=\\d{4,6}(?:\\s|$)))`;
const RHS_HAS_MORE_LABELS_REGEX = new RegExp(`\\b(?:${LABEL_PATTERN_STR})\\s*[:=]\\s*\\S+`, 'i');

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const PHONE_REGEX = /^(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{5,10}$/;
const BASE32_TOTP_REGEX = /^[A-Z2-7]{16,64}$/;
const HANDLE_REGEX = /^@?[a-z0-9][a-z0-9._-]{2,31}$/;

export function normaliseInput(raw: string): string[] {
  const unified = raw
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  return unified.split('\n').map((line) => {
    // Strip leading decorative list bullets (•, ●, ▪, ◦, *, numbered lists) while preserving blank lines
    const trimmed = line.trim();
    if (!trimmed) return '';
    return trimmed
      .replace(/^[•●▪◦]\s+/, '')
      .replace(/^\*\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^-\s+(?=[a-zA-Z0-9@])/, '');
  });
}

function parseCsvRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function mapCsvHeaderToRole(header: string): SmartFieldRole | null {
  const h = header.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (['name', 'title', 'account', 'service', 'grouping'].includes(h)) return 'account';
  if (['url', 'uri', 'login uri', 'website', 'origin'].includes(h)) return 'url';
  if (['username', 'login username', 'user', 'email', 'login'].includes(h)) return 'username';
  if (['password', 'login password', 'pass', 'pwd'].includes(h)) return 'password';
  if (['totp', 'login totp', 'otp', '2fa'].includes(h)) return 'totp';
  if (['notes', 'note', 'extra', 'comment', 'comments'].includes(h)) return 'notes';
  if (['pin', 'mpin'].includes(h)) return 'pin';
  return null;
}

function detectFormat(lines: string[]): { format: 'json' | 'csv' | 'tsv' | 'freetext'; delimiter?: string } {
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return { format: 'freetext' };

  const joined = nonEmpty.join('\n').trim();
  if ((joined.startsWith('[') && joined.endsWith(']')) || (joined.startsWith('{') && joined.endsWith('}'))) {
    try {
      const parsed = JSON.parse(joined);
      if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
        return { format: 'json' };
      }
    } catch {
      // Fall through to CSV/freetext
    }
  }

  for (const delim of [',', '\t'] as const) {
    if (nonEmpty.length >= 2) {
      const headerCols = parseCsvRow(nonEmpty[0], delim);
      if (headerCols.length >= 2) {
        const recognized = headerCols.filter((c) => mapCsvHeaderToRole(c) !== null).length;
        const secondCols = parseCsvRow(nonEmpty[1], delim);
        if (recognized >= 2 && Math.abs(headerCols.length - secondCols.length) <= 1) {
          return { format: delim === '\t' ? 'tsv' : 'csv', delimiter: delim };
        }
      }
    }
  }

  return { format: 'freetext' };
}

function makeConfidenceTier(score: number): ConfidenceTier {
  if (score >= 0.8) return 'auto';
  if (score >= 0.55) return 'check';
  return 'needs-user';
}

function inferEntryType(fields: Partial<Record<SmartFieldRole, FieldCandidate>>): EntryType {
  const title = fields.account?.token ?? '';
  const brand = matchBrandByText(title) ?? (fields.url ? matchBrandByDomain(fields.url.token) : null);
  if (brand?.defaultType) return brand.defaultType;
  if (fields.pin && !fields.url) return 'BANK';
  if (!fields.password && !fields.username && fields.notes) return 'NOTE';
  return 'LOGIN';
}

function parseJsonImport(rawText: string, existingEntries: DecryptedEntry[]): ParsedRecord[] {
  const parsed = JSON.parse(rawText);
  const items: Array<Record<string, unknown>> = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.items)
      ? parsed.items
      : [parsed];

  return items.map((item, idx) => {
    const fields: Partial<Record<SmartFieldRole, FieldCandidate>> = {};
    const login = (typeof item.login === 'object' && item.login !== null ? item.login : item) as Record<string, unknown>;

    const title = String(item.name ?? item.title ?? item.account ?? '');
    const username = String(login.username ?? item.username ?? item.user ?? item.email ?? '');
    const password = String(login.password ?? item.password ?? item.pass ?? '');
    const uris = Array.isArray(login.uris) ? login.uris : [];
    const firstUri = uris[0] && typeof uris[0] === 'object' ? String((uris[0] as Record<string, unknown>).uri ?? '') : '';
    const url = String(item.url ?? item.uri ?? firstUri ?? '');
    const totp = String(login.totp ?? item.totp ?? item.totpSecret ?? '');
    const notes = String(item.notes ?? item.note ?? '');

    if (title) fields.account = { token: title, role: 'account', score: 0.98, reason: 'JSON field "name"' };
    if (username) fields.username = { token: username, role: 'username', score: 0.98, reason: 'JSON field "username"' };
    if (password) fields.password = { token: password, role: 'password', score: 0.98, reason: 'JSON field "password"' };
    if (url) fields.url = { token: url, role: 'url', score: 0.98, reason: 'JSON field "url"' };
    if (totp) fields.totp = { token: totp, role: 'totp', score: 0.95, reason: 'JSON field "totp"' };
    if (notes) fields.notes = { token: notes, role: 'notes', score: 0.95, reason: 'JSON field "notes"' };

    fillMissingAccount(fields);
    const scores = Object.values(fields).map((f) => f?.score ?? 1);
    const confidence = scores.length > 0 ? Math.min(...scores) : 0.4;
    const tier = makeConfidenceTier(confidence);
    const rec: ParsedRecord = {
      id: `imp-${idx}-${Date.now()}`,
      rawLines: [JSON.stringify(item)],
      tokens: Object.values(fields).map((f) => f!.token),
      fields,
      extraNotes: [],
      confidence: Number(confidence.toFixed(2)),
      tier,
      detectedType: inferEntryType(fields),
      accepted: tier === 'auto',
      discarded: false,
      dedupeAction: 'create',
    };
    attachDedupe(rec, existingEntries);
    return rec;
  });
}

function parseCsvImport(lines: string[], delimiter: string, existingEntries: DecryptedEntry[]): ParsedRecord[] {
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length < 2) return [];
  const headers = parseCsvRow(nonEmpty[0], delimiter);
  const roleMap = headers.map(mapCsvHeaderToRole);

  const records: ParsedRecord[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cols = parseCsvRow(nonEmpty[i], delimiter);
    const fields: Partial<Record<SmartFieldRole, FieldCandidate>> = {};
    const extraNotes: string[] = [];

    cols.forEach((val, colIdx) => {
      if (!val) return;
      const role = roleMap[colIdx];
      if (!role) {
        extraNotes.push(`${headers[colIdx]}: ${val}`);
        return;
      }
      if (!fields[role]) {
        fields[role] = {
          token: val,
          role,
          score: 0.98,
          reason: `CSV header "${headers[colIdx]}"`,
        };
      } else {
        extraNotes.push(val);
      }
    });

    if (Object.keys(fields).length === 0) continue;
    fillMissingAccount(fields);
    const scores = Object.values(fields).map((f) => f?.score ?? 1);
    const confidence = scores.length > 0 ? Math.min(...scores) : 0.4;
    const tier = makeConfidenceTier(confidence);

    const rec: ParsedRecord = {
      id: `imp-${i}-${Date.now()}`,
      rawLines: [nonEmpty[i]],
      tokens: cols.filter(Boolean),
      fields,
      extraNotes,
      confidence: Number(confidence.toFixed(2)),
      tier,
      detectedType: inferEntryType(fields),
      accepted: tier === 'auto',
      discarded: false,
      dedupeAction: 'create',
    };
    attachDedupe(rec, existingEntries);
    records.push(rec);
  }
  return records;
}

interface ExtractedPair {
  role: SmartFieldRole;
  value: string;
  label: string;
}

function extractInlineLabelledSegments(line: string): {
  pairs: ExtractedPair[];
  remainderTokens: string[];
} {
  const pairs: ExtractedPair[] = [];
  let working = line;

  // Check whole-line "label separator value" first when only one separator exists or starts with label
  const singleMatch = working.match(/^([a-zA-Z0-9\u0900-\u097F\s._-]{2,24}?)\s*(?::|=|–|—|>|\||\t|\s-\s)\s*(.+)$/);
  if (singleMatch) {
    const candidateLabel = singleMatch[1].trim().toLowerCase();
    const role = LABEL_TO_ROLE.get(candidateLabel);
    const rhs = singleMatch[2].trim();
    // Check if RHS itself contains more inline labels like "user: riyak88 pwd: Kx9!pLm2"
    const rhsHasMoreLabels = RHS_HAS_MORE_LABELS_REGEX.test(rhs);
    if (role && !rhsHasMoreLabels) {
      return {
        pairs: [{ role, value: rhs, label: singleMatch[1].trim() }],
        remainderTokens: [],
      };
    }
  }

  // Extract inline `label: value` / `label = value` / `mpin 4821` occurrences inside a multi-field line
  const consumedRanges: Array<[number, number]> = [];
  const matches: Array<{ start: number; end: number; label: string; role: SmartFieldRole }> = [];

  const scanRegex = new RegExp(INLINE_SCAN_REGEX_SOURCE, 'gi');
  let m: RegExpExecArray | null;
  while ((m = scanRegex.exec(working)) !== null) {
    const labelStr = m[2].toLowerCase();
    const role = LABEL_TO_ROLE.get(labelStr);
    if (role) {
      matches.push({
        start: m.index + m[1].length,
        end: scanRegex.lastIndex,
        label: m[2],
        role,
      });
    }
  }

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      const nextStart = i + 1 < matches.length ? matches[i + 1].start : working.length;
      const rawVal = working.slice(curr.end, nextStart).trim().replace(/^[,\-|/]+\s*/, '').replace(/\s*[,\-|/]+$/, '');
      if (rawVal) {
        pairs.push({ role: curr.role, value: rawVal, label: curr.label });
        consumedRanges.push([curr.start, nextStart]);
      }
    }

    // Collect unconsumed prefix/segments
    let remainder = '';
    let cursor = 0;
    for (const [s, e] of consumedRanges) {
      if (s > cursor) {
        remainder += ' ' + working.slice(cursor, s);
      }
      cursor = e;
    }
    if (cursor < working.length) {
      remainder += ' ' + working.slice(cursor);
    }
    const cleanRemainder = remainder.replace(/\s*[-–—|/>:]\s*$/, '').trim();
    const remainderTokens = cleanRemainder ? splitUnlabelledLine(cleanRemainder) : [];
    return { pairs, remainderTokens };
  }

  return { pairs: [], remainderTokens: splitUnlabelledLine(working) };
}

function splitUnlabelledLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // Check if entire line is a known brand or multi-word account phrase with no separators
  if (matchBrandByText(trimmed)) {
    return [trimmed];
  }

  // Split on 2+ spaces, tab, " / ", " | ", " : ", or "," (keep URLs intact!)
  const tokens: string[] = [];
  // Temporarily protect https?:// URLs so `/` inside URLs isn't split
  const urlPlaceholders: string[] = [];
  const protectedLine = trimmed.replace(/https?:\/\/[^\s,|]+/gi, (match) => {
    urlPlaceholders.push(match);
    return `__URL_${urlPlaceholders.length - 1}__`;
  });

  const parts = protectedLine
    .split(/\s{2,}|\t|\s+\/\s+|\s*\|\s*|\s+:\s+|,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const restored = part.replace(/__URL_(\d+)__/g, (_, idx) => urlPlaceholders[Number(idx)]);
    // If part is a clean 2-3 token space-separated line like "@riya.k Sunflower#2291" where tokens look like credential fields, split further
    const spaceParts = restored.split(/\s+/);
    if (
      spaceParts.length >= 2 &&
      spaceParts.length <= 4 &&
      spaceParts.some(
        (sp) =>
          EMAIL_REGEX.test(sp) ||
          isLikelyUrlOrDomain(sp) ||
          sp.startsWith('@') ||
          scorePasswordToken(sp).score >= 0.8
      )
    ) {
      tokens.push(...spaceParts);
    } else {
      tokens.push(restored);
    }
  }

  return tokens;
}

function scorePasswordToken(token: string): { score: number; reason: string } {
  if (!token || /\s/.test(token)) return { score: 0, reason: '' };
  if (EMAIL_REGEX.test(token) || isLikelyUrlOrDomain(token)) {
    return { score: -0.6, reason: 'Matches email or URL (-0.60 penalty)' };
  }
  if (token.length < 6 || token.length > 128) return { score: 0, reason: '' };

  let classes = 0;
  if (/[a-z]/.test(token)) classes++;
  if (/[A-Z]/.test(token)) classes++;
  if (/[0-9]/.test(token)) classes++;
  if (/[^a-zA-Z0-9\s]/.test(token)) classes++;

  if (classes < 3) {
    // Allow long 10+ alphanumeric/mixed tokens with lower score
    if (classes >= 2 && token.length >= 8) {
      return {
        score: 0.65,
        reason: `${token.length} chars, ${classes} character types, no spaces`,
      };
    }
    return { score: 0, reason: '' };
  }

  let score = 0.85;
  const reasons = [`${token.length} chars`, `${classes} character types`, 'no spaces'];
  const entropy = calculateShannonEntropy(token);
  if (entropy >= 3.0 && !isDictionaryWord(token)) {
    score += 0.1;
    reasons.push(`entropy ${entropy.toFixed(1)} bits/char`);
  }
  const strength = evaluatePasswordStrength(token);
  if (strength.estimatedGuesses >= 1e6) {
    score += 0.05;
  }

  return {
    score: Math.min(1, Number(score.toFixed(2))),
    reason: `Marked as password: ${reasons.join(', ')}`,
  };
}

function scoreTokenForAllRoles(
  token: string,
  positionIdx: number,
  isAloneOnLine: boolean,
  hasBankContext: boolean
): Record<SmartFieldRole, FieldCandidate> {
  const candidates: Record<SmartFieldRole, FieldCandidate> = {
    account: { token, role: 'account', score: 0, reason: '' },
    username: { token, role: 'username', score: 0, reason: '' },
    password: { token, role: 'password', score: 0, reason: '' },
    url: { token, role: 'url', score: 0, reason: '' },
    pin: { token, role: 'pin', score: 0, reason: '' },
    totp: { token, role: 'totp', score: 0, reason: '' },
    notes: { token, role: 'notes', score: 0.15, reason: 'Fallback notes text' },
  };

  const brand = matchBrandByText(token);
  if (brand) {
    candidates.account = {
      token: brand.name,
      role: 'account',
      score: 0.92,
      reason: `Matched brand dictionary ("${token}" → ${brand.name})`,
    };
  } else if (
    (isAloneOnLine || positionIdx === 0) &&
    /^[A-Z][a-zA-Z0-9&'.-]*(?:\s+[A-Z0-9][a-zA-Z0-9&'.-]*){0,2}$/.test(token) &&
    !EMAIL_REGEX.test(token) &&
    !isLikelyUrlOrDomain(token) &&
    !/[!@#$%^&*]/.test(token)
  ) {
    const score = isAloneOnLine ? 0.6 : 0.65;
    candidates.account = {
      token,
      role: 'account',
      score,
      reason: isAloneOnLine ? 'Title Case heading alone on line' : 'First-slot account title (+0.10 positional prior)',
    };
  }

  if (EMAIL_REGEX.test(token)) {
    candidates.username = {
      token,
      role: 'username',
      score: 0.95,
      reason: 'RFC email address pattern',
    };
  } else if (PHONE_REGEX.test(token) && token.replace(/\D/g, '').length >= 10 && token.replace(/\D/g, '').length <= 15) {
    candidates.username = {
      token,
      role: 'username',
      score: 0.8,
      reason: '10–15 digit phone number pattern',
    };
  } else if (HANDLE_REGEX.test(token.toLowerCase()) && !isLikelyUrlOrDomain(token)) {
    const lower = token.toLowerCase();
    const symbolCount = (lower.match(/[._-]/g) ?? []).length;
    const hasPwMix = /[A-Z]/.test(token) && /[0-9]/.test(token) && /[^a-zA-Z0-9]/.test(token);
    if (symbolCount <= 2 && !hasPwMix) {
      const posBonus = positionIdx === 1 || token.startsWith('@') ? 0.1 : 0;
      const total = Math.min(0.9, Number((0.7 + posBonus).toFixed(2)));
      candidates.username = {
        token,
        role: 'username',
        score: total,
        reason: posBonus > 0 ? 'Handle/username pattern + positional slot (+0.10)' : 'Handle/username pattern',
      };
    }
  }

  if (isLikelyUrlOrDomain(token)) {
    candidates.url = {
      token: token.startsWith('http') ? token : `https://${token}`,
      role: 'url',
      score: 0.95,
      reason: 'URL / valid public suffix domain',
    };
  }

  if (/^\d{4,6}$/.test(token) && hasBankContext) {
    candidates.pin = {
      token,
      role: 'pin',
      score: 0.85,
      reason: '4–6 digit numeric PIN in banking context',
    };
  }

  const pwScore = scorePasswordToken(token);
  if (pwScore.score !== 0) {
    const posBonus = pwScore.score > 0 && positionIdx === 2 ? 0.05 : 0;
    candidates.password = {
      token,
      role: 'password',
      score: Math.min(1, Number((pwScore.score + posBonus).toFixed(2))),
      reason: pwScore.reason,
    };
  }

  if (BASE32_TOTP_REGEX.test(token.replace(/\s+/g, '').toUpperCase())) {
    candidates.totp = {
      token: token.toUpperCase(),
      role: 'totp',
      score: 0.65,
      reason: 'Base32 secret token (16–64 chars)',
    };
  }

  const words = token.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && !brand) {
    candidates.notes = {
      token,
      role: 'notes',
      score: 0.7,
      reason: 'Multi-word descriptive text (3+ words)',
    };
  }

  return candidates;
}

function fillMissingAccount(fields: Partial<Record<SmartFieldRole, FieldCandidate>>): void {
  if (fields.account) return;
  const source = fields.url?.token ?? fields.username?.token;
  if (!source) return;
  if (source.includes('@') || isLikelyUrlOrDomain(source)) {
    const derived = deriveAccountTitleFromDomain(source);
    if (derived) {
      fields.account = {
        token: derived,
        role: 'account',
        score: 0.85,
        reason: `Derived from domain via Public Suffix List (${derived})`,
      };
    }
  }
}

function attachDedupe(rec: ParsedRecord, existingEntries: DecryptedEntry[]): void {
  const newUser = rec.fields.username?.token?.trim().toLowerCase() ?? '';
  const newUrl = rec.fields.url?.token ?? '';
  const newHost = newUrl ? extractHostname(newUrl) : null;
  const newReg = newHost ? getRegistrableDomain(newHost) : null;
  const newTitle = rec.fields.account?.token?.trim().toLowerCase() ?? '';

  for (const existing of existingEntries) {
    if (existing.deletedAt !== null) continue;
    const exUser = (existing.data.username ?? '').trim().toLowerCase();
    const exTitle = existing.data.title.trim().toLowerCase();
    const exRegs = existing.data.urls
      .map((u) => extractHostname(u))
      .filter((h): h is string => Boolean(h))
      .map(getRegistrableDomain);

    const sameUser = Boolean(newUser && exUser && newUser === exUser);
    const sameDomain = Boolean(newReg && exRegs.includes(newReg));
    const sameTitle = Boolean(newTitle && exTitle && newTitle === exTitle);

    if (sameUser && (sameDomain || sameTitle)) {
      rec.duplicateOfId = existing.id;
      rec.duplicateOfTitle = existing.data.title;
      rec.dedupeAction = 'update';
      return;
    }
  }
}

interface RawRecordChunk {
  lines: string[];
  labelledPairs: ExtractedPair[];
  unlabelledTokens: Array<{ token: string; isAloneOnLine: boolean }>;
}

function segmentFreeTextLines(lines: string[]): RawRecordChunk[] {
  const chunks: RawRecordChunk[] = [];
  let current: RawRecordChunk = { lines: [], labelledPairs: [], unlabelledTokens: [] };
  let filledRoles = new Set<SmartFieldRole>();

  const flush = () => {
    if (current.lines.length > 0) {
      chunks.push(current);
      current = { lines: [], labelledPairs: [], unlabelledTokens: [] };
      filledRoles = new Set<SmartFieldRole>();
    }
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }

    const { pairs, remainderTokens } = extractInlineLabelledSegments(line);

    // Check if a repeated label forces a new record boundary
    const hasRepeatedRole = pairs.some((p) => filledRoles.has(p.role));
    const isStandaloneHeading =
      pairs.length === 0 &&
      remainderTokens.length === 1 &&
      (line.endsWith(':') || Boolean(matchBrandByText(line)) || isLikelyUrlOrDomain(line));

    if (
      current.lines.length > 0 &&
      (hasRepeatedRole || (isStandaloneHeading && (filledRoles.has('password') || filledRoles.has('username') || current.unlabelledTokens.length >= 2)))
    ) {
      flush();
    }

    current.lines.push(line);

    for (const pair of pairs) {
      current.labelledPairs.push(pair);
      filledRoles.add(pair.role);
    }

    // Handle trailing ":" heading lines like "GitHub:"
    if (pairs.length === 0 && line.endsWith(':') && remainderTokens.length === 1) {
      const stripped = line.slice(0, -1).trim();
      if (stripped) {
        current.unlabelledTokens.push({ token: stripped, isAloneOnLine: true });
      }
    } else {
      for (const tok of remainderTokens) {
        current.unlabelledTokens.push({
          token: tok,
          isAloneOnLine: remainderTokens.length === 1 && pairs.length === 0,
        });
      }
    }
  }

  flush();
  return chunks;
}

export function parseSmartImport(
  rawInput: string,
  existingEntries: DecryptedEntry[] = [],
  templates: ImportTemplate[] = []
): SmartImportResult {
  const start = performance.now();
  const lines = normaliseInput(rawInput);
  const { format, delimiter } = detectFormat(lines);

  if (format === 'json') {
    const records = parseJsonImport(lines.filter(Boolean).join('\n'), existingEntries);
    return {
      detectedFormat: 'json',
      records,
      durationMs: Math.round(performance.now() - start),
      lineCount: lines.length,
    };
  }

  if ((format === 'csv' || format === 'tsv') && delimiter) {
    const records = parseCsvImport(lines, delimiter, existingEntries);
    return {
      detectedFormat: format,
      records,
      durationMs: Math.round(performance.now() - start),
      lineCount: lines.length,
    };
  }

  const chunks = segmentFreeTextLines(lines);
  const records: ParsedRecord[] = [];

  chunks.forEach((chunk, idx) => {
    const fields: Partial<Record<SmartFieldRole, FieldCandidate>> = {};
    const extraNotes: string[] = [];

    // 1. Apply explicit labelled pairs first (score 0.98, or 0.90 for Base32 TOTP)
    for (const pair of chunk.labelledPairs) {
      let score = 0.98;
      let reason = `Explicit label "${pair.label}" matched`;
      if (pair.role === 'totp' && BASE32_TOTP_REGEX.test(pair.value.replace(/\s+/g, '').toUpperCase())) {
        score = 0.9;
        reason = `Base32 secret with label "${pair.label}"`;
      }
      if (!fields[pair.role]) {
        fields[pair.role] = {
          token: pair.value,
          role: pair.role,
          score,
          reason,
        };
      } else {
        extraNotes.push(`${pair.label}: ${pair.value}`);
      }
    }

    // Check if any matched brand implies banking context (for 4-6 digit PIN scoring)
    const allTextTokens = [
      ...(fields.account ? [fields.account.token] : []),
      ...chunk.unlabelledTokens.map((t) => t.token),
    ];
    const hasBankContext = allTextTokens.some((t) => {
      const b = matchBrandByText(t);
      return b?.defaultType === 'BANK' || /\b(bank|upi|atm|card|sbi|hdfc|icici|axis|kotak|paytm|phonepe|mpin|pin)\b/i.test(t);
    });

    // 2. Check saved local user templates only when raw lines actually match the template delimiter and don't conflict with clear URLs
    let templateApplied = false;
    const rawJoined = chunk.lines.join('\n');
    if (templates.length > 0 && chunk.labelledPairs.length === 0 && chunk.unlabelledTokens.length >= 2) {
      for (const tpl of templates) {
        const hasDelim = !tpl.delimiter || rawJoined.includes(tpl.delimiter.trim());
        const wouldMisclassifyUrl =
          tpl.fieldOrder[0] === 'account' && isLikelyUrlOrDomain(chunk.unlabelledTokens[0].token);
        if (hasDelim && !wouldMisclassifyUrl && tpl.fieldOrder.length === chunk.unlabelledTokens.length) {
          chunk.unlabelledTokens.forEach((item, pos) => {
            const role = tpl.fieldOrder[pos];
            if (role && !fields[role]) {
              fields[role] = {
                token: item.token,
                role,
                score: 0.9,
                reason: `Applied saved template "${tpl.name}"`,
              };
            }
          });
          templateApplied = true;
          break;
        }
      }
    }

    // 3. Score unlabelled tokens and assign greedily by highest score with slot constraints
    if (!templateApplied) {
      const tokenAssignments = chunk.unlabelledTokens.map((item, posIdx) => ({
        item,
        posIdx,
        scores: scoreTokenForAllRoles(item.token, posIdx, item.isAloneOnLine, hasBankContext),
      }));

      // Build candidate edges (tokenIdx, role, candidate)
      const edges: Array<{ tokenIdx: number; role: SmartFieldRole; candidate: FieldCandidate }> = [];
      const assignableRoles: SmartFieldRole[] = ['account', 'url', 'username', 'password', 'pin', 'totp'];

      tokenAssignments.forEach((ta, tokenIdx) => {
        for (const role of assignableRoles) {
          const cand = ta.scores[role];
          if (cand.score > 0.25) {
            edges.push({ tokenIdx, role, candidate: cand });
          }
        }
      });

      edges.sort((a, b) => b.candidate.score - a.candidate.score);

      const assignedTokenIndices = new Set<number>();
      for (const edge of edges) {
        if (assignedTokenIndices.has(edge.tokenIdx)) continue;
        if (fields[edge.role]) continue;
        fields[edge.role] = edge.candidate;
        assignedTokenIndices.add(edge.tokenIdx);
      }

      // Leftover tokens go to Notes
      tokenAssignments.forEach((ta, tokenIdx) => {
        if (!assignedTokenIndices.has(tokenIdx)) {
          if (!fields.notes) {
            fields.notes = {
              token: ta.item.token,
              role: 'notes',
              score: ta.scores.notes.score >= 0.7 ? ta.scores.notes.score : 0.65,
              reason: ta.scores.notes.reason || 'Unassigned text placed in Notes',
            };
          } else {
            extraNotes.push(ta.item.token);
          }
        }
      });
    }

    // Normalise account name with brand dictionary if present
    if (fields.account) {
      const brand = matchBrandByText(fields.account.token);
      if (brand && brand.name !== fields.account.token) {
        fields.account = {
          ...fields.account,
          token: brand.name,
          score: Math.max(fields.account.score, 0.92),
          reason: `Matched brand dictionary ("${fields.account.token}" → ${brand.name})`,
        };
      }
    } else {
      fillMissingAccount(fields);
    }

    // Confidence = lowest field score across core credential fields
    const coreScores = (['account', 'username', 'password', 'url', 'pin', 'totp'] as SmartFieldRole[])
      .map((r) => fields[r]?.score)
      .filter((s): s is number => typeof s === 'number');
    const confidence = coreScores.length > 0 ? Math.min(...coreScores) : 0.4;
    const tier = makeConfidenceTier(confidence);

    const rec: ParsedRecord = {
      id: `imp-${idx}-${Date.now()}`,
      rawLines: chunk.lines,
      tokens: [
        ...chunk.labelledPairs.map((p) => p.value),
        ...chunk.unlabelledTokens.map((t) => t.token),
      ],
      fields,
      extraNotes,
      confidence: Number(confidence.toFixed(2)),
      tier,
      detectedType: inferEntryType(fields),
      accepted: tier === 'auto',
      discarded: false,
      dedupeAction: 'create',
    };
    attachDedupe(rec, existingEntries);
    records.push(rec);
  });

  return {
    detectedFormat: 'freetext',
    records,
    durationMs: Math.round(performance.now() - start),
    lineCount: lines.length,
  };
}

export function reassignParsedRecordField(
  record: ParsedRecord,
  fromRole: SmartFieldRole,
  toRole: SmartFieldRole
): ParsedRecord {
  if (fromRole === toRole) return record;
  const nextFields = { ...record.fields };
  const moving = nextFields[fromRole];
  if (!moving) return record;

  const displaced = nextFields[toRole];
  delete nextFields[fromRole];
  nextFields[toRole] = {
    ...moving,
    role: toRole,
    score: 0.98,
    reason: `Reassigned manually to ${toRole}`,
  };
  if (displaced) {
    nextFields[fromRole] = {
      ...displaced,
      role: fromRole,
      score: 0.98,
      reason: `Swapped manually to ${fromRole}`,
    };
  }

  const coreScores = (['account', 'username', 'password', 'url', 'pin', 'totp'] as SmartFieldRole[])
    .map((r) => nextFields[r]?.score)
    .filter((s): s is number => typeof s === 'number');
  const confidence = coreScores.length > 0 ? Math.min(...coreScores) : record.confidence;
  const tier = makeConfidenceTier(confidence);

  return {
    ...record,
    fields: nextFields,
    confidence: Number(confidence.toFixed(2)),
    tier,
    detectedType: inferEntryType(nextFields),
  };
}
