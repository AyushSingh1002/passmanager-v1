import React, { useState } from 'react';
import {
  AlertCircle,
  BookmarkPlus,
  Check,
  FileUp,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { generateUuid } from '../core/crypto';
import { t } from '../core/i18n';
import { parseSmartImport, reassignParsedRecordField } from '../core/parser';
import type {
  DecryptedEntry,
  DedupeAction,
  ImportTemplate,
  LanguageCode,
  ParsedRecord,
  SmartFieldRole,
  SmartImportResult,
} from '../types/vault';

interface SmartImportViewProps {
  existingEntries: DecryptedEntry[];
  templates: ImportTemplate[];
  language: LanguageCode;
  onSaveImportedRecords: (records: ParsedRecord[]) => Promise<number>;
  onSaveTemplate: (template: ImportTemplate) => void;
}

const SAMPLE_MESSY_NOTES = `Insta
@riya.k  Sunflower#2291

SBI net banking - user: riyak88 pwd: Kx9!pLm2
mpin 4821

accounts.google.com
riya.kapoor@gmail.com
Tr!ckyPass99

site: Cloudflare
email: ops@example.in
password: Cf!9201xYz#
2fa: JBSWY3DPEHPK3PXP

MyLocalForum / ayu_dev / DevPass#8821`;

const ROLES: Array<{ role: SmartFieldRole; label: string }> = [
  { role: 'account', label: 'Account' },
  { role: 'username', label: 'Username' },
  { role: 'password', label: 'Password' },
  { role: 'url', label: 'URL' },
  { role: 'pin', label: 'PIN' },
  { role: 'totp', label: '2FA Secret' },
  { role: 'notes', label: 'Notes' },
];

export const SmartImportView: React.FC<SmartImportViewProps> = ({
  existingEntries,
  templates,
  language,
  onSaveImportedRecords,
  onSaveTemplate,
}) => {
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState<SmartImportResult | null>(null);
  const [editingChip, setEditingChip] = useState<{ recordId: string; role: SmartFieldRole } | null>(null);
  const [templateSavedMsg, setTemplateSavedMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedBanner, setImportedBanner] = useState<string | null>(null);

  const handleAnalyse = () => {
    if (!rawText.trim()) return;
    const parsed = parseSmartImport(rawText, existingEntries, templates);
    setResult(parsed);
    setImportedBanner(null);
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    const parsed = parseSmartImport(text, existingEntries, templates);
    setResult(parsed);
    setImportedBanner(null);
  };

  const handleReassignRole = (recordId: string, fromRole: SmartFieldRole, toRole: SmartFieldRole) => {
    if (!result) return;
    setResult({
      ...result,
      records: result.records.map((rec) =>
        rec.id === recordId ? reassignParsedRecordField(rec, fromRole, toRole) : rec
      ),
    });
    setEditingChip(null);
  };

  const handleToggleAccept = (recordId: string) => {
    if (!result) return;
    setResult({
      ...result,
      records: result.records.map((rec) =>
        rec.id === recordId ? { ...rec, accepted: !rec.accepted, discarded: false } : rec
      ),
    });
  };

  const handleDiscard = (recordId: string) => {
    if (!result) return;
    setResult({
      ...result,
      records: result.records.map((rec) =>
        rec.id === recordId ? { ...rec, discarded: true, accepted: false } : rec
      ),
    });
  };

  const handleDedupeChange = (recordId: string, dedupeAction: DedupeAction) => {
    if (!result) return;
    setResult({
      ...result,
      records: result.records.map((rec) =>
        rec.id === recordId ? { ...rec, dedupeAction } : rec
      ),
    });
  };

  const handleApplyToSimilarLines = (rec: ParsedRecord) => {
    const order = (Object.keys(rec.fields) as SmartFieldRole[]).filter((r) => Boolean(rec.fields[r]));
    if (order.length < 2) return;
    const tpl: ImportTemplate = {
      id: generateUuid(),
      name: `${order.join(' / ')} (${order.length} fields)`,
      delimiter: ' / ',
      fieldOrder: order,
      createdAt: Date.now(),
    };
    onSaveTemplate(tpl);
    setTemplateSavedMsg(`Saved local pattern "${tpl.name}" (editable in Settings)`);
    window.setTimeout(() => setTemplateSavedMsg(''), 4000);
  };

  const handleCommitAccepted = async (acceptHighConfidenceOnly: boolean) => {
    if (!result || importing) return;
    const chosen = result.records.filter((r) => {
      if (r.discarded) return false;
      if (acceptHighConfidenceOnly) return r.tier === 'auto' || r.accepted;
      return r.accepted;
    });
    if (chosen.length === 0) return;

    setImporting(true);
    try {
      const count = await onSaveImportedRecords(chosen);
      // Wipe raw text from memory after import as required by hygiene rules
      setRawText('');
      setResult(null);
      setImportedBanner(`Encrypted and saved ${count} entry${count === 1 ? '' : ' entries'} to your vault.`);
    } finally {
      setImporting(false);
    }
  };

  const activeRecords = result?.records.filter((r) => !r.discarded) ?? [];
  const readyCount = activeRecords.filter((r) => r.tier === 'auto').length;
  const checkCount = activeRecords.filter((r) => r.tier !== 'auto').length;
  const acceptedCount = activeRecords.filter((r) => r.accepted).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-vl-rise">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t(language, 'smartImport')}</h1>
          <p className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
            Deterministic regex, dictionary & scoring classifier — zero AI, zero network, raw input wiped after import.
          </p>
        </div>
        {result && (
          <button
            type="button"
            onClick={() => setResult(null)}
            className="h-9 px-3.5 rounded-xl border border-[var(--vl-border)] text-xs font-medium inline-flex items-center gap-1.5 self-start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Edit raw text</span>
          </button>
        )}
      </div>

      {importedBanner && (
        <div className="p-4 rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-medium text-[var(--vl-strong)]">
            <Check className="w-4 h-4 shrink-0" />
            <span>{importedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportedBanner(null)}
            aria-label="Dismiss import message"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--vl-text-secondary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!result ? (
        <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="smart-import-textarea" className="text-xs font-medium text-[var(--vl-text-secondary)]">
              Paste notes, WhatsApp forwards, CSV, or JSON exports
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_MESSY_NOTES)}
                className="h-9 px-3 rounded-xl bg-[var(--vl-surface-muted)] text-xs font-medium hover:opacity-90"
              >
                {t(language, 'pasteSample')}
              </button>
              <label className="h-9 px-3 rounded-xl border border-[var(--vl-border)] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-[var(--vl-surface-muted)]">
                <FileUp className="w-3.5 h-3.5" />
                <span>{t(language, 'pickFile')}</span>
                <input type="file" accept=".txt,.csv,.tsv,.json" onChange={handleFilePick} className="hidden" />
              </label>
            </div>
          </div>

          <textarea
            id="smart-import-textarea"
            rows={11}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Insta\n@riya.k  Sunflower#2291\n\nSBI net banking - user: riyak88 pwd: Kx9!pLm2\nmpin 4821`}
            className="w-full p-4 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret leading-relaxed focus:outline-none focus:border-[var(--vl-accent)]"
          />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-[var(--vl-text-secondary)]">
              Supports Chrome, Bitwarden, LastPass, 1Password CSV, JSON, and unlabelled notes.
            </p>
            <button
              type="button"
              disabled={!rawText.trim()}
              onClick={handleAnalyse}
              className="h-11 px-6 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] disabled:opacity-40 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t(language, 'analyse')}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Bar */}
          <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm font-medium tabular-nums">
              {activeRecords.length} found
              <span aria-hidden="true" className="mx-2 text-[var(--vl-text-secondary)]">·</span>
              <span className="text-[var(--vl-strong)]">{readyCount} ready</span>
              <span aria-hidden="true" className="mx-2 text-[var(--vl-text-secondary)]">·</span>
              <span className="text-[var(--vl-fair)]">{checkCount} check</span>
              <span aria-hidden="true" className="mx-2 text-[var(--vl-text-secondary)]">·</span>
              <span className="text-xs text-[var(--vl-text-secondary)]">
                {result.detectedFormat.toUpperCase()} in {result.durationMs}ms
              </span>
            </div>

            <div className="flex items-center gap-2">
              {readyCount > 0 && (
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => handleCommitAccepted(true)}
                  className="h-10 px-4 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] text-white text-xs font-medium whitespace-nowrap"
                >
                  {t(language, 'acceptAllReady')} ({acceptedCount})
                </button>
              )}
              {readyCount === 0 && acceptedCount > 0 && (
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => handleCommitAccepted(false)}
                  className="h-10 px-4 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] text-white text-xs font-medium whitespace-nowrap"
                >
                  Import selected ({acceptedCount})
                </button>
              )}
            </div>
          </div>

          {templateSavedMsg && (
            <div className="p-3 rounded-xl bg-[var(--vl-accent-soft)] text-[var(--vl-accent)] text-xs font-medium">
              {templateSavedMsg}
            </div>
          )}

          {activeRecords.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] text-center space-y-2">
              <p className="text-sm font-medium">No records remaining</p>
              <p className="text-xs text-[var(--vl-text-secondary)]">
                Go back to edit raw text or paste another snippet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeRecords.map((rec) => {
                const tierColor =
                  rec.tier === 'auto'
                    ? 'var(--vl-strong)'
                    : rec.tier === 'check'
                      ? 'var(--vl-fair)'
                      : 'var(--vl-weak)';
                const tierLabel =
                  rec.tier === 'auto' ? 'Ready' : rec.tier === 'check' ? 'Check' : 'Needs you';

                return (
                  <div
                    key={rec.id}
                    className={`rounded-2xl bg-[var(--vl-surface)] border p-4 sm:p-5 space-y-3 transition-colors ${
                      rec.accepted ? 'border-[var(--vl-accent)]' : 'border-[var(--vl-border)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-sm">
                          {rec.fields.account?.token || 'Untitled entry'}
                        </span>
                        <span aria-hidden="true" className="text-[var(--vl-text-secondary)]">·</span>
                        <span className="font-medium tabular-nums" style={{ color: tierColor }}>
                          {tierLabel} ({Math.round(rec.confidence * 100)}%)
                        </span>
                        <span aria-hidden="true" className="text-[var(--vl-text-secondary)]">·</span>
                        <span className="text-[var(--vl-text-secondary)]">{rec.detectedType}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApplyToSimilarLines(rec)}
                          title="Save field order as local template"
                          className="h-8 px-2.5 rounded-lg border border-[var(--vl-border)] text-xs text-[var(--vl-text-secondary)] hover:text-[var(--vl-text-primary)] inline-flex items-center gap-1"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Apply to similar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleAccept(rec.id)}
                          aria-label={rec.accepted ? 'Unselect record' : 'Accept record'}
                          className={`h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1 ${
                            rec.accepted
                              ? 'bg-[var(--vl-accent)] text-white'
                              : 'border border-[var(--vl-border)] text-[var(--vl-text-primary)]'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{rec.accepted ? 'Accepted' : 'Accept'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscard(rec.id)}
                          aria-label="Discard record"
                          className="w-8 h-8 rounded-lg border border-[var(--vl-border)] flex items-center justify-center text-[var(--vl-text-secondary)] hover:text-[var(--vl-weak)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Interactive Field Reassignment Chips */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(Object.keys(rec.fields) as SmartFieldRole[]).map((role) => {
                        const field = rec.fields[role];
                        if (!field) return null;
                        const isEditing =
                          editingChip?.recordId === rec.id && editingChip?.role === role;
                        const roleLabel = ROLES.find((r) => r.role === role)?.label ?? role;

                        return (
                          <div
                            key={role}
                            className="p-2.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingChip(isEditing ? null : { recordId: rec.id, role })
                                }
                                className="text-[11px] font-semibold text-[var(--vl-accent)] hover:underline"
                              >
                                {roleLabel} (tap to reassign)
                              </button>
                              <span className="text-[11px] tabular-nums text-[var(--vl-text-secondary)]">
                                {Math.round(field.score * 100)}%
                              </span>
                            </div>
                            <div className="text-sm font-mono-secret break-all">{field.token}</div>
                            <div className="text-[11px] text-[var(--vl-text-secondary)]">
                              {field.reason}
                            </div>

                            {isEditing && (
                              <div className="pt-1 flex flex-wrap gap-1">
                                {ROLES.map((target) => (
                                  <button
                                    key={target.role}
                                    type="button"
                                    onClick={() => handleReassignRole(rec.id, role, target.role)}
                                    className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                                      target.role === role
                                        ? 'bg-[var(--vl-accent)] text-white'
                                        : 'bg-[var(--vl-surface)] border border-[var(--vl-border)]'
                                    }`}
                                  >
                                    {target.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {rec.duplicateOfId && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--vl-border)] text-xs">
                        <span className="inline-flex items-center gap-1.5 text-[var(--vl-fair)]">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Matches existing entry “{rec.duplicateOfTitle}”</span>
                        </span>
                        <select
                          aria-label="Duplicate resolution action"
                          value={rec.dedupeAction}
                          onChange={(e) => handleDedupeChange(rec.id, e.target.value as DedupeAction)}
                          className="h-8 px-2.5 rounded-lg bg-[var(--vl-bg)] border border-[var(--vl-border)] text-xs"
                        >
                          <option value="update">Update existing</option>
                          <option value="keep-both">Keep both</option>
                          <option value="skip">Skip</option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
