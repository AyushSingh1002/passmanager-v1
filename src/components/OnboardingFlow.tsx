import React, { useState } from 'react';
import { ArrowRight, Check, Download, Eye, EyeOff, KeyRound, Lock, ShieldCheck, Upload } from 'lucide-react';
import { createVaultMeta, exportEncryptedVlbak, importEncryptedVlbak, type VlbakEnvelope } from '../core/crypto';
import { evaluatePasswordStrength } from '../core/password';
import { createSampleEntries, DEFAULT_SETTINGS, saveVaultBundle, sealAllEntries } from '../core/storage';
import { t } from '../core/i18n';
import type { DecryptedEntry, LanguageCode, VaultStorageBundle } from '../types/vault';
import { StrengthMeter } from './ui/StrengthMeter';

interface OnboardingFlowProps {
  language: LanguageCode;
  onComplete: (args: {
    bundle: VaultStorageBundle;
    rawVaultKey: Uint8Array;
    entries: DecryptedEntry[];
    openSmartImport?: boolean;
  }) => void;
  onLoadDemo: () => Promise<void>;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  language,
  onComplete,
  onLoadDemo,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [noRecoveryAck, setNoRecoveryAck] = useState(false);
  const [enableQuickUnlock, setEnableQuickUnlock] = useState(true);
  const [initialChoice, setInitialChoice] = useState<'empty' | 'import' | 'sample'>('empty');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Restore modal state
  const [restoreMode, setRestoreMode] = useState(false);
  const [restoreFile, setRestoreFile] = useState<VlbakEnvelope | null>(null);
  const [restorePass, setRestorePass] = useState('');

  // Created state for step 5 backup download
  const [pendingState, setPendingState] = useState<{
    bundle: VaultStorageBundle;
    rawVaultKey: Uint8Array;
    entries: DecryptedEntry[];
    master: string;
  } | null>(null);

  const strength = evaluatePasswordStrength(masterPassword);
  const canProceedPassword =
    strength.score >= 3 &&
    masterPassword.length >= 8 &&
    masterPassword === confirmPassword &&
    noRecoveryAck;

  const handleCreateVault = async (choice: 'empty' | 'import' | 'sample') => {
    setBusy(true);
    setError('');
    try {
      setInitialChoice(choice);
      const { meta, rawVaultKey } = await createVaultMeta(masterPassword, {
        enableQuickUnlock,
      });
      const entries = choice === 'sample' ? createSampleEntries() : [];
      const sealedRows = await sealAllEntries(rawVaultKey, entries);
      const bundle: VaultStorageBundle = {
        meta,
        entries: sealedRows,
        templates: [],
        settings: {
          ...DEFAULT_SETTINGS,
          quickUnlockEnabled: enableQuickUnlock,
          language,
        },
      };
      saveVaultBundle(bundle);
      setPendingState({ bundle, rawVaultKey, entries, master: masterPassword });
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize vault');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadFirstBackup = async () => {
    if (!pendingState) return;
    setBusy(true);
    try {
      const envelope = await exportEncryptedVlbak(pendingState.master, pendingState.entries);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaultline-backup-${new Date().toISOString().slice(0, 10)}.vlbak`;
      a.click();
      URL.revokeObjectURL(url);

      const updatedBundle: VaultStorageBundle = {
        ...pendingState.bundle,
        settings: { ...pendingState.bundle.settings, lastBackupAt: Date.now() },
      };
      saveVaultBundle(updatedBundle);
      onComplete({
        bundle: updatedBundle,
        rawVaultKey: pendingState.rawVaultKey,
        entries: pendingState.entries,
        openSmartImport: initialChoice === 'import',
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePickRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as VlbakEnvelope;
      if (parsed.magic !== 'VAULTLINE_BAK_V1') {
        setError('Selected file is not a valid .vlbak backup');
        return;
      }
      setRestoreFile(parsed);
      setError('');
    } catch {
      setError('Could not read backup file');
    }
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile || !restorePass) return;
    setBusy(true);
    setError('');
    try {
      const entries = await importEncryptedVlbak(restorePass, restoreFile);
      const { meta, rawVaultKey } = await createVaultMeta(restorePass, { enableQuickUnlock: false });
      const sealed = await sealAllEntries(rawVaultKey, entries);
      const bundle: VaultStorageBundle = {
        meta,
        entries: sealed,
        templates: [],
        settings: { ...DEFAULT_SETTINGS, language, lastBackupAt: Date.now() },
      };
      saveVaultBundle(bundle);
      onComplete({ bundle, rawVaultKey, entries });
    } catch {
      setError('Incorrect backup master password or corrupted .vlbak file');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-[var(--vl-bg)] text-[var(--vl-text-primary)]">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-6 sm:p-8 animate-vl-rise">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--vl-accent-soft)] text-[var(--vl-accent)] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">{t(language, 'appName')}</span>
          </div>
          <span className="text-xs tabular-nums text-[var(--vl-text-secondary)]">
            {restoreMode ? 'Restore' : `${step} / 5`}
          </span>
        </div>

        {restoreMode ? (
          <form onSubmit={handleRestoreSubmit} className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Restore encrypted backup</h1>
            <p className="text-sm text-[var(--vl-text-secondary)]">
              Choose a `.vlbak` file and enter the master password used when that backup was created.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-[var(--vl-text-secondary)]">Backup file (.vlbak)</span>
              <input
                type="file"
                accept=".vlbak,.json"
                onChange={handlePickRestoreFile}
                className="mt-1.5 block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-medium file:bg-[var(--vl-surface-muted)] file:text-[var(--vl-text-primary)] hover:file:opacity-90"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[var(--vl-text-secondary)]">Backup master password</span>
              <input
                type="password"
                value={restorePass}
                onChange={(e) => setRestorePass(e.target.value)}
                placeholder="Enter backup master password"
                className="mt-1.5 w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm focus:outline-none focus:border-[var(--vl-accent)]"
              />
            </label>
            {error && <p className="text-xs text-[var(--vl-weak)]">{error}</p>}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRestoreMode(false);
                  setError('');
                }}
                className="h-11 px-4 rounded-xl border border-[var(--vl-border)] text-sm font-medium whitespace-nowrap"
              >
                {t(language, 'back')}
              </button>
              <button
                type="submit"
                disabled={!restoreFile || !restorePass || busy}
                className="flex-1 h-11 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] disabled:opacity-40 text-white text-sm font-medium whitespace-nowrap transition-colors"
              >
                {busy ? 'Decrypting…' : 'Restore vault'}
              </button>
            </div>
          </form>
        ) : step === 1 ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
                {t(language, 'tagline')}
              </h1>
              <p className="text-sm text-[var(--vl-text-secondary)] leading-relaxed">
                AES-256-GCM envelope encryption, deterministic rule-based Smart Import, and zero network requests. Everything lives locally in this device’s storage.
              </p>
            </div>

            <div className="space-y-2 text-xs text-[var(--vl-text-secondary)] border-t border-b border-[var(--vl-border)] py-4">
              <div className="flex items-center justify-between">
                <span>Encryption cipher</span>
                <span className="font-medium text-[var(--vl-text-primary)]">AES-256-GCM + PBKDF2-SHA256</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Smart Import engine</span>
                <span className="font-medium text-[var(--vl-text-primary)]">Deterministic rules · No AI</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Network transmission</span>
                <span className="font-medium text-[var(--vl-strong)]">None · 100% offline</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full h-12 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <span>{t(language, 'getStarted')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onLoadDemo}
                className="w-full h-11 px-4 rounded-xl bg-[var(--vl-surface-muted)] hover:opacity-90 text-[var(--vl-text-primary)] text-sm font-medium transition-opacity"
              >
                {t(language, 'loadDemoVault')}
              </button>
              <button
                type="button"
                onClick={() => setRestoreMode(true)}
                className="w-full h-10 px-4 rounded-xl text-xs font-medium text-[var(--vl-text-secondary)] hover:text-[var(--vl-text-primary)] flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Restore from .vlbak backup</span>
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t(language, 'createMasterTitle')}</h1>
              <p className="text-xs text-[var(--vl-text-secondary)] mt-1">
                {t(language, 'createMasterSubtitle')}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="onb-master" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1.5">
                  {t(language, 'masterPasswordLabel')} (must reach Good / Strong)
                </label>
                <div className="relative">
                  <input
                    id="onb-master"
                    type={showPassword ? 'text' : 'password'}
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    placeholder="e.g. Alpine-Kestrel-48!River"
                    className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret focus:outline-none focus:border-[var(--vl-accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide master password' : 'Show master password'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--vl-text-secondary)] hover:text-[var(--vl-text-primary)]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <StrengthMeter password={masterPassword} />

              <div>
                <label htmlFor="onb-confirm" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1.5">
                  {t(language, 'confirmPasswordLabel')}
                </label>
                <input
                  id="onb-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter master password"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret focus:outline-none focus:border-[var(--vl-accent)]"
                />
                {confirmPassword && confirmPassword !== masterPassword && (
                  <p className="text-xs text-[var(--vl-weak)] mt-1">Passwords do not match</p>
                )}
              </div>

              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noRecoveryAck}
                  onChange={(e) => setNoRecoveryAck(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-[var(--vl-accent)]"
                />
                <span className="text-xs text-[var(--vl-text-secondary)] leading-relaxed">
                  {t(language, 'noRecoveryLabel')}
                </span>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-11 px-4 rounded-xl border border-[var(--vl-border)] text-sm font-medium"
              >
                {t(language, 'back')}
              </button>
              <button
                type="button"
                disabled={!canProceedPassword}
                onClick={() => setStep(3)}
                className="flex-1 h-11 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {t(language, 'continue')}
              </button>
            </div>
          </div>
        ) : step === 3 ? (
          <div className="space-y-5">
            <div className="w-11 h-11 rounded-2xl bg-[var(--vl-accent-soft)] text-[var(--vl-accent)] flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Device key quick unlock</h1>
              <p className="text-sm text-[var(--vl-text-secondary)] mt-1 leading-relaxed">
                Wrap your Vault Key with a non-exportable local device key stored in IndexedDB so you can unlock quickly between sessions. You will still be asked for your master password every 7 days.
              </p>
            </div>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[var(--vl-border)] cursor-pointer">
              <div>
                <div className="text-sm font-medium">Enable device key quick unlock</div>
                <div className="text-xs text-[var(--vl-text-secondary)]">Can be changed anytime in Settings</div>
              </div>
              <input
                type="checkbox"
                checked={enableQuickUnlock}
                onChange={(e) => setEnableQuickUnlock(e.target.checked)}
                className="w-5 h-5 accent-[var(--vl-accent)]"
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-11 px-4 rounded-xl border border-[var(--vl-border)] text-sm font-medium"
              >
                {t(language, 'back')}
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex-1 h-11 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] text-white text-sm font-medium transition-colors"
              >
                {t(language, 'continue')}
              </button>
            </div>
          </div>
        ) : step === 4 ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Start your vault</h1>
              <p className="text-xs text-[var(--vl-text-secondary)] mt-1">
                Import existing messy notes, start with sample entries, or open an empty vault.
              </p>
            </div>

            {error && <p className="text-xs text-[var(--vl-weak)]">{error}</p>}

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleCreateVault('import')}
                className="w-full p-4 rounded-xl border border-[var(--vl-border)] hover:border-[var(--vl-accent)] text-left transition-colors"
              >
                <div className="text-sm font-semibold">Smart Import from notes or CSV</div>
                <div className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
                  Paste messy text, WhatsApp snippets, or browser CSV exports
                </div>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleCreateVault('sample')}
                className="w-full p-4 rounded-xl border border-[var(--vl-border)] hover:border-[var(--vl-accent)] text-left transition-colors"
              >
                <div className="text-sm font-semibold">Include 6 sample entries</div>
                <div className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
                  GitHub with 2FA, SBI Net Banking, Card, Wi-Fi, and Audit examples
                </div>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleCreateVault('empty')}
                className="w-full p-4 rounded-xl border border-[var(--vl-border)] hover:border-[var(--vl-accent)] text-left transition-colors"
              >
                <div className="text-sm font-semibold">Start with an empty vault</div>
                <div className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
                  Add credentials one by one as you need them
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStep(3)}
              className="h-10 px-4 rounded-xl border border-[var(--vl-border)] text-sm font-medium"
            >
              {t(language, 'back')}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="w-11 h-11 rounded-2xl bg-[var(--vl-accent-soft)] text-[var(--vl-strong)] flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Save your first encrypted backup</h1>
              <p className="text-sm text-[var(--vl-text-secondary)] mt-1 leading-relaxed">
                Your local vault key is bound to this device’s keystore. Save a `.vlbak` file encrypted under your master password so you can restore on a new device.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={handleDownloadFirstBackup}
                className="w-full h-12 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download .vlbak backup & open vault</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!pendingState) return;
                  onComplete({
                    bundle: pendingState.bundle,
                    rawVaultKey: pendingState.rawVaultKey,
                    entries: pendingState.entries,
                    openSmartImport: initialChoice === 'import',
                  });
                }}
                className="w-full h-11 px-4 rounded-xl border border-[var(--vl-border)] text-sm font-medium flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>{t(language, 'skip')} (remind me in 30 days)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
