import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { t } from '../core/i18n';
import type { ImportTemplate, LanguageCode, ThemeMode, VaultSettings } from '../types/vault';

interface SettingsViewProps {
  settings: VaultSettings;
  templates: ImportTemplate[];
  onUpdateSettings: (patch: Partial<VaultSettings>) => Promise<void>;
  onDeleteTemplate: (id: string) => void;
  onWipeVault: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  templates,
  onUpdateSettings,
  onDeleteTemplate,
  onWipeVault,
}) => {
  const [confirmWipe, setConfirmWipe] = useState(false);
  const lang = settings.language;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-vl-rise">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t(lang, 'settings')}</h1>
        <p className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
          All preferences are stored locally on this device.
        </p>
      </div>

      {/* Security & Timing */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] divide-y divide-[var(--vl-border)]">
        <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Auto-lock timeout</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">
              Lock vault automatically after inactivity
            </div>
          </div>
          <select
            aria-label="Auto-lock timeout"
            value={settings.autoLockSeconds}
            onChange={(e) => onUpdateSettings({ autoLockSeconds: Number(e.target.value) })}
            className="h-10 px-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-xs font-medium"
          >
            <option value={0}>Immediate on blur</option>
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
            <option value={-1}>Manual lock only</option>
          </select>
        </div>

        <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Clipboard auto-clear</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">
              Overwrite copied secrets after timeout
            </div>
          </div>
          <select
            aria-label="Clipboard auto-clear timeout"
            value={settings.clipboardClearSeconds}
            onChange={(e) => onUpdateSettings({ clipboardClearSeconds: Number(e.target.value) })}
            className="h-10 px-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-xs font-medium"
          >
            <option value={15}>15 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>60 seconds</option>
            <option value={0}>Off</option>
          </select>
        </div>

        <label className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm font-medium">Device key quick unlock</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">
              Use non-exportable IndexedDB key between 7-day master password checks
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.quickUnlockEnabled}
            onChange={(e) => onUpdateSettings({ quickUnlockEnabled: e.target.checked })}
            className="w-5 h-5 accent-[var(--vl-accent)]"
          />
        </label>

        <label className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm font-medium">Privacy screen shield</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">
              Blur vault contents when switching tabs or minimizing window (FLAG_SECURE mode)
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.privacyShieldEnabled}
            onChange={(e) => onUpdateSettings({ privacyShieldEnabled: e.target.checked })}
            className="w-5 h-5 accent-[var(--vl-accent)]"
          />
        </label>

        <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Duress auto-wipe</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">
              Erase vault permanently after N consecutive wrong password attempts
            </div>
          </div>
          <select
            aria-label="Duress auto-wipe attempts"
            value={settings.duressWipeAttempts}
            onChange={(e) => onUpdateSettings({ duressWipeAttempts: Number(e.target.value) })}
            className="h-10 px-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-xs font-medium"
          >
            <option value={0}>Disabled</option>
            <option value={10}>After 10 failures</option>
            <option value={15}>After 15 failures</option>
          </select>
        </div>
      </div>

      {/* Appearance & Language */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] divide-y divide-[var(--vl-border)]">
        <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Theme</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">Light, Dark, or AMOLED pure black</div>
          </div>
          <div className="inline-flex p-1 rounded-xl bg-[var(--vl-surface-muted)]">
            {(['light', 'dark', 'amoled'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onUpdateSettings({ theme: mode })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                  settings.theme === mode
                    ? 'bg-[var(--vl-surface)] text-[var(--vl-text-primary)] shadow-sm'
                    : 'text-[var(--vl-text-secondary)]'
                }`}
              >
                {mode === 'amoled' ? 'AMOLED' : mode}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Language</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">English & Hindi (हिन्दी)</div>
          </div>
          <div className="inline-flex p-1 rounded-xl bg-[var(--vl-surface-muted)]">
            {[
              { code: 'en' as LanguageCode, label: 'English' },
              { code: 'hi' as LanguageCode, label: 'हिन्दी' },
            ].map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => onUpdateSettings({ language: item.code })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  settings.language === item.code
                    ? 'bg-[var(--vl-surface)] text-[var(--vl-text-primary)] shadow-sm'
                    : 'text-[var(--vl-text-secondary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <label className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm font-medium">Reduce animations</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">
              Instant transitions for accessibility
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.reduceAnimations}
            onChange={(e) => onUpdateSettings({ reduceAnimations: e.target.checked })}
            className="w-5 h-5 accent-[var(--vl-accent)]"
          />
        </label>
      </div>

      {/* Saved Smart Import Templates */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-4 sm:p-5 space-y-3">
        <div>
          <div className="text-sm font-medium">Saved Smart Import templates</div>
          <div className="text-xs text-[var(--vl-text-secondary)]">
            Explicit user-saved field ordering rules (not AI learning).
          </div>
        </div>

        {templates.length === 0 ? (
          <p className="text-xs text-[var(--vl-text-secondary)]">No custom templates saved yet.</p>
        ) : (
          <div className="divide-y divide-[var(--vl-border)] border border-[var(--vl-border)] rounded-xl">
            {templates.map((tpl) => (
              <div key={tpl.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{tpl.name}</div>
                  <div className="text-[11px] text-[var(--vl-text-secondary)]">
                    Order: {tpl.fieldOrder.join(' → ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteTemplate(tpl.id)}
                  aria-label={`Delete template ${tpl.name}`}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--vl-text-secondary)] hover:text-[var(--vl-weak)]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[var(--vl-weak)]">Erase vault</div>
            <div className="text-xs text-[var(--vl-text-secondary)]">
              Permanently wipe all encrypted entries and the local device keystore key.
            </div>
          </div>
          {!confirmWipe && (
            <button
              type="button"
              onClick={() => setConfirmWipe(true)}
              className="h-10 px-4 rounded-xl border border-[var(--vl-weak)] text-[var(--vl-weak)] text-xs font-medium whitespace-nowrap"
            >
              Wipe vault
            </button>
          )}
        </div>

        {confirmWipe && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmWipe(false)}
              className="h-9 px-4 rounded-lg border border-[var(--vl-border)] text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onWipeVault}
              className="h-9 px-4 rounded-lg bg-[var(--vl-weak)] text-white text-xs font-medium"
            >
              Confirm permanent wipe
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
