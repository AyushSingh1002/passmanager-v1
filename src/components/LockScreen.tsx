import React, { useEffect, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, KeyRound, Lock, ShieldAlert, Upload } from 'lucide-react';
import {
  calculateLockoutDurationMs,
  importEncryptedVlbak,
  unlockVaultWithPassword,
  unlockVaultWithQuickDeviceKey,
  type VlbakEnvelope,
} from '../core/crypto';
import { t } from '../core/i18n';
import { DEFAULT_SETTINGS, saveVaultBundle, sealAllEntries, unsealAllEntries, wipeEntireVault } from '../core/storage';
import type { DecryptedEntry, VaultStorageBundle } from '../types/vault';

interface LockScreenProps {
  bundle: VaultStorageBundle;
  onUnlock: (args: {
    bundle: VaultStorageBundle;
    rawVaultKey: Uint8Array;
    entries: DecryptedEntry[];
  }) => void;
  onWiped: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ bundle, onUnlock, onWiped }) => {
  const lang = bundle.settings.language;
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const lockoutRemainingMs = Math.max(0, bundle.meta.lockoutUntil - nowMs);
  const isLockedOut = lockoutRemainingMs > 0;

  useEffect(() => {
    if (!isLockedOut) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [isLockedOut]);

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const quickUnlockAvailable =
    Boolean(bundle.settings.quickUnlockEnabled && bundle.meta.quickUnlockWrappedKey) &&
    Date.now() - bundle.settings.lastMasterPasswordCheckAt < sevenDaysMs;

  const triggerShake = (msg: string) => {
    setError(msg);
    setShake(true);
    window.setTimeout(() => setShake(false), 320);
  };

  const handlePasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut || !password || busy) return;

    setBusy(true);
    setError('');
    try {
      const rawVaultKey = await unlockVaultWithPassword(bundle.meta, password);
      const entries = await unsealAllEntries(rawVaultKey, bundle);
      const nextBundle: VaultStorageBundle = {
        ...bundle,
        meta: { ...bundle.meta, failedAttempts: 0, lockoutUntil: 0 },
        settings: { ...bundle.settings, lastMasterPasswordCheckAt: Date.now() },
      };
      saveVaultBundle(nextBundle);
      setPassword('');
      onUnlock({ bundle: nextBundle, rawVaultKey, entries });
    } catch {
      const nextFails = bundle.meta.failedAttempts + 1;
      if (bundle.settings.duressWipeAttempts > 0 && nextFails >= bundle.settings.duressWipeAttempts) {
        await wipeEntireVault();
        onWiped();
        return;
      }
      const lockoutMs = calculateLockoutDurationMs(nextFails);
      const nextBundle: VaultStorageBundle = {
        ...bundle,
        meta: {
          ...bundle.meta,
          failedAttempts: nextFails,
          lockoutUntil: lockoutMs > 0 ? Date.now() + lockoutMs : 0,
        },
      };
      saveVaultBundle(nextBundle);
      bundle.meta.failedAttempts = nextFails;
      bundle.meta.lockoutUntil = nextBundle.meta.lockoutUntil;
      setNowMs(Date.now());
      triggerShake(
        lockoutMs > 0
          ? `Too many failed attempts. Locked for ${Math.ceil(lockoutMs / 1000)}s.`
          : `Incorrect master password (${nextFails} failed attempt${nextFails === 1 ? '' : 's'}).`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleQuickUnlock = async () => {
    if (isLockedOut || busy) return;
    setBusy(true);
    setError('');
    try {
      const rawVaultKey = await unlockVaultWithQuickDeviceKey(bundle.meta);
      const entries = await unsealAllEntries(rawVaultKey, bundle);
      const nextBundle: VaultStorageBundle = {
        ...bundle,
        meta: { ...bundle.meta, failedAttempts: 0, lockoutUntil: 0 },
      };
      saveVaultBundle(nextBundle);
      onUnlock({ bundle: nextBundle, rawVaultKey, entries });
    } catch {
      triggerShake('Device key quick unlock unavailable. Enter master password.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !password) {
      setError('Enter the backup master password above before selecting a .vlbak file.');
      return;
    }
    try {
      const env = JSON.parse(await file.text()) as VlbakEnvelope;
      const entries = await importEncryptedVlbak(password, env);
      const sealed = await sealAllEntries(await unlockVaultWithPassword(bundle.meta, password), entries);
      const nextBundle: VaultStorageBundle = {
        ...bundle,
        entries: sealed,
        settings: { ...DEFAULT_SETTINGS, ...bundle.settings, lastBackupAt: Date.now() },
      };
      saveVaultBundle(nextBundle);
      const rawVk = await unlockVaultWithPassword(nextBundle.meta, password);
      onUnlock({ bundle: nextBundle, rawVaultKey: rawVk, entries });
    } catch {
      triggerShake('Could not restore .vlbak backup with that password.');
    }
  };

  const secondsLeft = Math.ceil(lockoutRemainingMs / 1000);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-[var(--vl-bg)] text-[var(--vl-text-primary)]">
      <div
        className={`w-full max-w-md rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-6 sm:p-8 animate-vl-rise ${
          shake ? 'animate-vl-shake' : ''
        }`}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[var(--vl-accent-soft)] text-[var(--vl-accent)] flex items-center justify-center mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{t(lang, 'appName')}</h1>
          <p className="text-xs text-[var(--vl-text-secondary)] mt-1 tabular-nums">
            {bundle.entries.filter((e) => e.deletedAt === null).length} encrypted entries stored locally
          </p>
        </div>

        <form onSubmit={handlePasswordUnlock} className="space-y-4">
          <div>
            <label htmlFor="lock-master-input" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1.5">
              {t(lang, 'masterPasswordLabel')}
            </label>
            <div className="relative">
              <input
                id="lock-master-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                disabled={isLockedOut || busy}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t(lang, 'enterMasterPassword')}
                autoFocus
                className="w-full h-12 pl-3.5 pr-11 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret focus:outline-none focus:border-[var(--vl-accent)] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg flex items-center justify-center text-[var(--vl-text-secondary)] hover:text-[var(--vl-text-primary)]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isLockedOut && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--vl-surface-muted)] text-xs text-[var(--vl-weak)]">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span className="tabular-nums">Progressive lockout active · Try again in {secondsLeft}s</span>
            </div>
          )}

          {error && !isLockedOut && (
            <div className="flex items-center gap-2 text-xs text-[var(--vl-weak)]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!password || isLockedOut || busy}
            className="w-full h-12 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {busy ? 'Deriving key…' : t(lang, 'unlockVault')}
          </button>

          {quickUnlockAvailable && (
            <button
              type="button"
              disabled={isLockedOut || busy}
              onClick={handleQuickUnlock}
              className="w-full h-11 px-4 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <KeyRound className="w-4 h-4 text-[var(--vl-accent)]" />
              <span>{t(lang, 'quickUnlock')}</span>
            </button>
          )}
        </form>

        <div className="mt-6 pt-4 border-t border-[var(--vl-border)] flex items-center justify-between text-xs text-[var(--vl-text-secondary)]">
          <label className="cursor-pointer hover:text-[var(--vl-text-primary)] inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span>Restore .vlbak</span>
            <input type="file" accept=".vlbak,.json" onChange={handleRestoreFile} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => setShowResetConfirm((v) => !v)}
            className="hover:text-[var(--vl-weak)]"
          >
            Wipe & start fresh
          </button>
        </div>

        {showResetConfirm && (
          <div className="mt-3 p-3.5 rounded-xl bg-[var(--vl-surface-muted)] space-y-2.5">
            <p className="text-xs text-[var(--vl-text-secondary)]">
              This permanently erases the encrypted vault and device keystore key from this browser.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 h-9 rounded-lg border border-[var(--vl-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await wipeEntireVault();
                  onWiped();
                }}
                className="flex-1 h-9 rounded-lg bg-[var(--vl-weak)] text-white text-xs font-medium"
              >
                Confirm wipe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
