import React from 'react';
import { Lock, ShieldCheck, WifiOff } from 'lucide-react';
import { t } from '../core/i18n';
import type { LanguageCode, VaultMeta } from '../types/vault';

interface AboutSecurityViewProps {
  meta: VaultMeta;
  language: LanguageCode;
}

export const AboutSecurityView: React.FC<AboutSecurityViewProps> = ({ meta, language }) => {
  const threats = [
    {
      threat: 'Lost or stolen device',
      defence: 'PBKDF2-SHA256 / Argon2id derived key, hardware-bound device wrapping key, auto-lock, progressive lockout',
    },
    {
      threat: 'Vault storage copied off device',
      defence: 'Wrapped Vault Key requires non-exportable device keystore key; backup archives require master password',
    },
    {
      threat: 'Clipboard snooping',
      defence: 'Auto-clear timer overwrites copied secrets after 30s (configurable)',
    },
    {
      threat: 'Brute force on lock screen',
      defence: 'Progressive lockout: 5 failures trigger 30s, doubling up to 30 minutes, persisted across reloads',
    },
    {
      threat: 'Parameter downgrade attack',
      defence: 'Format version and KDF iteration count are bound into AES-GCM Additional Authenticated Data (AAD)',
    },
    {
      threat: 'Shoulder surfing / app switcher capture',
      defence: 'Passwords masked by default with toggle/press-and-hold reveal + privacy blur shield on window blur',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-vl-rise">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t(language, 'aboutSecurity')}</h1>
        <p className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
          Plain-language threat model, cryptographic envelope parameters, and stated out-of-scope boundaries.
        </p>
      </div>

      {/* Zero-network & Crypto Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <WifiOff className="w-4 h-4 text-[var(--vl-strong)]" />
            <span>Zero-network guarantee</span>
          </div>
          <p className="text-xs text-[var(--vl-text-secondary)] leading-relaxed">
            Vaultline invokes zero external APIs, zero remote fonts, zero AI models, and zero telemetry. Smart Import runs strictly with deterministic local rules.
          </p>
        </div>

        <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="w-4 h-4 text-[var(--vl-accent)]" />
            <span>Active envelope parameters</span>
          </div>
          <p className="text-xs text-[var(--vl-text-secondary)] leading-relaxed tabular-nums">
            Format v{meta.formatVersion} · {meta.kdf.toUpperCase()} ({meta.kdfIterations.toLocaleString()} iterations) · AES-256-GCM per-entry random 96-bit nonces.
          </p>
        </div>
      </div>

      {/* Threat Model Table */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--vl-border)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--vl-accent)]" />
          <h2 className="text-sm font-semibold">What Vaultline defends against</h2>
        </div>
        <div className="divide-y divide-[var(--vl-border)]">
          {threats.map((item) => (
            <div key={item.threat} className="p-4 sm:px-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="text-xs font-semibold">{item.threat}</div>
              <div className="sm:col-span-2 text-xs text-[var(--vl-text-secondary)] leading-relaxed">
                {item.defence}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stated Out of Scope */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 space-y-2">
        <h2 className="text-sm font-semibold">Honest out-of-scope threats</h2>
        <p className="text-xs text-[var(--vl-text-secondary)] leading-relaxed">
          No local password manager can protect against a compromised OS/root instrumentation while unlocked, a malicious keyboard/extension logging keystrokes, an unattended unlocked device, or a forgotten master password (no backdoor or account recovery exists by design — keep a `.vlbak` backup).
        </p>
      </div>
    </div>
  );
};
