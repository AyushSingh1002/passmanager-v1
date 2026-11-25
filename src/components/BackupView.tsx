import React, { useState } from 'react';
import { AlertTriangle, Check, Download, FileSpreadsheet, Upload } from 'lucide-react';
import {
  exportEncryptedVlbak,
  importEncryptedVlbak,
  unlockVaultWithPassword,
  type VlbakEnvelope,
} from '../core/crypto';
import { t } from '../core/i18n';
import type { DecryptedEntry, LanguageCode, VaultMeta } from '../types/vault';

interface BackupViewProps {
  meta: VaultMeta;
  entries: DecryptedEntry[];
  lastBackupAt: number | null;
  language: LanguageCode;
  onBackupCreated: () => void;
  onRestoreEntries: (entries: DecryptedEntry[]) => Promise<void>;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const BackupView: React.FC<BackupViewProps> = ({
  meta,
  entries,
  lastBackupAt,
  language,
  onBackupCreated,
  onRestoreEntries,
}) => {
  const [masterPassInput, setMasterPassInput] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [restoreFile, setRestoreFile] = useState<VlbakEnvelope | null>(null);
  const [csvVerifyPass, setCsvVerifyPass] = useState('');
  const [showCsvPrompt, setShowCsvPrompt] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const activeEntries = entries.filter((e) => e.deletedAt === null);

  const handleCreateVlbak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterPassInput || busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      // Verify master password matches current vault before encrypting backup with it
      await unlockVaultWithPassword(meta, masterPassInput);
      const envelope = await exportEncryptedVlbak(masterPassInput, entries);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaultline-backup-${new Date().toISOString().slice(0, 10)}.vlbak`;
      a.click();
      URL.revokeObjectURL(url);
      setMasterPassInput('');
      onBackupCreated();
      setStatusMsg({ type: 'ok', text: `Encrypted .vlbak backup created (${entries.length} entries).` });
    } catch {
      setStatusMsg({ type: 'err', text: 'Incorrect master password.' });
    } finally {
      setBusy(false);
    }
  };

  const handlePickRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as VlbakEnvelope;
      if (parsed.magic !== 'VAULTLINE_BAK_V1') {
        setStatusMsg({ type: 'err', text: 'Invalid .vlbak backup file.' });
        return;
      }
      setRestoreFile(parsed);
      setStatusMsg(null);
    } catch {
      setStatusMsg({ type: 'err', text: 'Could not parse backup file.' });
    }
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile || !restorePass || busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const restored = await importEncryptedVlbak(restorePass, restoreFile);
      await onRestoreEntries(restored);
      setRestorePass('');
      setRestoreFile(null);
      setStatusMsg({ type: 'ok', text: `Restored ${restored.length} entries into your vault.` });
    } catch {
      setStatusMsg({ type: 'err', text: 'Incorrect backup password or tampered .vlbak file.' });
    } finally {
      setBusy(false);
    }
  };

  const handlePlaintextCsvExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvVerifyPass || busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      await unlockVaultWithPassword(meta, csvVerifyPass);
      const header = ['name', 'url', 'username', 'password', 'totp', 'notes'].join(',');
      const rows = activeEntries.map((entry) =>
        [
          escapeCsvCell(entry.data.title),
          escapeCsvCell(entry.data.urls[0] ?? ''),
          escapeCsvCell(entry.data.username ?? ''),
          escapeCsvCell(entry.data.password ?? ''),
          escapeCsvCell(entry.data.totpSecret ?? ''),
          escapeCsvCell(entry.data.notes ?? ''),
        ].join(',')
      );
      const csvContent = [header, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaultline-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setCsvVerifyPass('');
      setShowCsvPrompt(false);
      setStatusMsg({ type: 'ok', text: 'Plaintext CSV exported. Delete the file once imported elsewhere.' });
    } catch {
      setStatusMsg({ type: 'err', text: 'Incorrect master password for CSV export.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-vl-rise">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t(language, 'backup')}</h1>
        <p className="text-xs text-[var(--vl-text-secondary)] mt-0.5 tabular-nums">
          Last encrypted backup:{' '}
          {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'Not backed up yet'}
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl border text-xs font-medium flex items-center gap-2 ${
            statusMsg.type === 'ok'
              ? 'border-[var(--vl-strong)] text-[var(--vl-strong)] bg-[var(--vl-surface)]'
              : 'border-[var(--vl-weak)] text-[var(--vl-weak)] bg-[var(--vl-surface)]'
          }`}
        >
          {statusMsg.type === 'ok' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Create Encrypted .vlbak */}
      <form
        onSubmit={handleCreateVlbak}
        className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 sm:p-6 space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold">Create encrypted backup (.vlbak)</h2>
          <p className="text-xs text-[var(--vl-text-secondary)] mt-1 leading-relaxed">
            Portable AES-256-GCM archive encrypted under your master password only (independent of this device’s keystore). Recommended every 30 days.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            value={masterPassInput}
            onChange={(e) => setMasterPassInput(e.target.value)}
            placeholder="Confirm master password"
            aria-label="Confirm master password for backup"
            className="flex-1 h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret focus:outline-none focus:border-[var(--vl-accent)]"
          />
          <button
            type="submit"
            disabled={!masterPassInput || busy}
            className="h-11 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] disabled:opacity-40 text-white text-sm font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Download .vlbak</span>
          </button>
        </div>
      </form>

      {/* Restore Encrypted .vlbak */}
      <form
        onSubmit={handleRestoreSubmit}
        className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 sm:p-6 space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold">Restore from .vlbak archive</h2>
          <p className="text-xs text-[var(--vl-text-secondary)] mt-1">
            Merges restored entries into your unlocked vault.
          </p>
        </div>

        <input
          type="file"
          accept=".vlbak,.json"
          onChange={handlePickRestore}
          className="block w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-medium file:bg-[var(--vl-surface-muted)] file:text-[var(--vl-text-primary)]"
        />

        {restoreFile && (
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="password"
              value={restorePass}
              onChange={(e) => setRestorePass(e.target.value)}
              placeholder="Backup master password"
              className="flex-1 h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
            />
            <button
              type="submit"
              disabled={!restorePass || busy}
              className="h-11 px-5 rounded-xl bg-[var(--vl-accent)] text-white text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Restore entries</span>
            </button>
          </div>
        )}
      </form>

      {/* Interop Plaintext CSV Export */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Export Chrome / Bitwarden CSV</h2>
            <p className="text-xs text-[var(--vl-text-secondary)] mt-1">
              Interoperable plaintext CSV for migrating between password managers. Requires master password verification.
            </p>
          </div>
          {!showCsvPrompt && (
            <button
              type="button"
              onClick={() => setShowCsvPrompt(true)}
              className="h-10 px-4 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          )}
        </div>

        {showCsvPrompt && (
          <form onSubmit={handlePlaintextCsvExport} className="p-4 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] space-y-3">
            <p className="text-xs text-[var(--vl-weak)] flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Warning: CSV exports are unencrypted plaintext.</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="password"
                value={csvVerifyPass}
                onChange={(e) => setCsvVerifyPass(e.target.value)}
                placeholder="Master password"
                className="flex-1 h-10 px-3 rounded-xl bg-[var(--vl-surface)] border border-[var(--vl-border)] text-sm font-mono-secret"
              />
              <button
                type="button"
                onClick={() => setShowCsvPrompt(false)}
                className="h-10 px-4 rounded-xl border border-[var(--vl-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!csvVerifyPass || busy}
                className="h-10 px-4 rounded-xl bg-[var(--vl-weak)] text-white text-xs font-medium"
              >
                Confirm export
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
