import React, { useState } from 'react';
import { Dices, Eye, EyeOff, Plus, Star, Trash2, X } from 'lucide-react';
import { generateUuid } from '../core/crypto';
import { generateRandomPassword } from '../core/password';
import type { CustomField, DecryptedEntry, EntryJson, EntryType } from '../types/vault';
import { StrengthMeter } from './ui/StrengthMeter';

interface EntryFormModalProps {
  initialEntry?: DecryptedEntry | null;
  defaultPassword?: string;
  onSave: (data: EntryJson, existingId?: string) => Promise<void>;
  onClose: () => void;
}

const ENTRY_TYPES: Array<{ type: EntryType; label: string }> = [
  { type: 'LOGIN', label: 'Login' },
  { type: 'BANK', label: 'Bank / UPI' },
  { type: 'CARD', label: 'Card' },
  { type: 'WIFI', label: 'Wi-Fi' },
  { type: 'NOTE', label: 'Secure note' },
  { type: 'IDENTITY', label: 'Identity' },
];

export const EntryFormModal: React.FC<EntryFormModalProps> = ({
  initialEntry,
  defaultPassword = '',
  onSave,
  onClose,
}) => {
  const d = initialEntry?.data;
  const [type, setType] = useState<EntryType>(d?.type ?? 'LOGIN');
  const [title, setTitle] = useState(d?.title ?? '');
  const [username, setUsername] = useState(d?.username ?? '');
  const [password, setPassword] = useState(d?.password ?? defaultPassword);
  const [showPw, setShowPw] = useState(false);
  const [urlsText, setUrlsText] = useState((d?.urls ?? []).join(', '));
  const [pin, setPin] = useState(d?.pin ?? '');
  const [totpSecret, setTotpSecret] = useState(d?.totpSecret ?? '');
  const [notes, setNotes] = useState(d?.notes ?? '');
  const [tagsText, setTagsText] = useState((d?.tags ?? []).join(', '));
  const [favourite, setFavourite] = useState(d?.favourite ?? false);

  // Type-specific fields
  const [cardHolder, setCardHolder] = useState(d?.cardHolder ?? '');
  const [cardNumber, setCardNumber] = useState(d?.cardNumber ?? '');
  const [cardExpiry, setCardExpiry] = useState(d?.cardExpiry ?? '');
  const [cardCvv, setCardCvv] = useState(d?.cardCvv ?? '');
  const [bankAccountNumber, setBankAccountNumber] = useState(d?.bankAccountNumber ?? '');
  const [bankIfsc, setBankIfsc] = useState(d?.bankIfsc ?? '');
  const [upiId, setUpiId] = useState(d?.upiId ?? '');
  const [wifiSsid, setWifiSsid] = useState(d?.wifiSsid ?? '');
  const [wifiSecurity, setWifiSecurity] = useState<'WPA3' | 'WPA2' | 'WEP' | 'Open'>(d?.wifiSecurity ?? 'WPA3');
  const [identityFullName, setIdentityFullName] = useState(d?.identityFullName ?? '');
  const [identityEmail, setIdentityEmail] = useState(d?.identityEmail ?? '');
  const [identityPhone, setIdentityPhone] = useState(d?.identityPhone ?? '');
  const [identityDocNumber, setIdentityDocNumber] = useState(d?.identityDocNumber ?? '');
  const [identityAddress, setIdentityAddress] = useState(d?.identityAddress ?? '');

  const [customFields, setCustomFields] = useState<CustomField[]>(d?.customFields ?? []);
  const [saving, setSaving] = useState(false);

  const handleQuickGenerate = () => {
    const generated = generateRandomPassword({
      length: 18,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
      excludeLookalikes: true,
    });
    setPassword(generated);
    setShowPw(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const payload: EntryJson = {
        type,
        title: title.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        urls: urlsText
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean),
        pin: pin.trim() || undefined,
        totpSecret: totpSecret.trim() || undefined,
        notes: notes.trim() || undefined,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        favourite,
        customFields: customFields.filter((cf) => cf.label.trim() || cf.value.trim()),
        source: d?.source ?? 'manual',
        cardHolder: cardHolder.trim() || undefined,
        cardNumber: cardNumber.trim() || undefined,
        cardExpiry: cardExpiry.trim() || undefined,
        cardCvv: cardCvv.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankIfsc: bankIfsc.trim() || undefined,
        upiId: upiId.trim() || undefined,
        wifiSsid: wifiSsid.trim() || undefined,
        wifiSecurity: type === 'WIFI' ? wifiSecurity : undefined,
        identityFullName: identityFullName.trim() || undefined,
        identityEmail: identityEmail.trim() || undefined,
        identityPhone: identityPhone.trim() || undefined,
        identityDocNumber: identityDocNumber.trim() || undefined,
        identityAddress: identityAddress.trim() || undefined,
      };
      await onSave(payload, initialEntry?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-form-heading"
        className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 sm:p-6 animate-vl-rise"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="entry-form-heading" className="text-lg font-semibold tracking-tight">
            {initialEntry ? 'Edit entry' : 'New entry'}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFavourite((f) => !f)}
              aria-label={favourite ? 'Remove from favourites' : 'Mark as favourite'}
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[var(--vl-surface-muted)]"
            >
              <Star
                className={`w-4 h-4 ${
                  favourite ? 'fill-amber-400 text-amber-400' : 'text-[var(--vl-text-secondary)]'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close entry form"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--vl-text-secondary)] hover:bg-[var(--vl-surface-muted)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Entry Type Segmented Controls */}
          <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-[var(--vl-surface-muted)]">
            {ENTRY_TYPES.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => setType(item.type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  type === item.type
                    ? 'bg-[var(--vl-surface)] text-[var(--vl-text-primary)] shadow-sm'
                    : 'text-[var(--vl-text-secondary)] hover:text-[var(--vl-text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="ef-title" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
              Title / Service name *
            </label>
            <input
              id="ef-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'WIFI' ? 'Home Fiber 5G' : type === 'BANK' ? 'SBI Net Banking' : 'GitHub'}
              className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm focus:outline-none focus:border-[var(--vl-accent)]"
            />
          </div>

          {(type === 'LOGIN' || type === 'BANK') && (
            <div>
              <label htmlFor="ef-user" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                Username / Email / Customer ID
              </label>
              <input
                id="ef-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="name@example.com"
                className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm focus:outline-none focus:border-[var(--vl-accent)]"
              />
            </div>
          )}

          {type === 'WIFI' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ef-ssid" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Network SSID
                </label>
                <input
                  id="ef-ssid"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="Studio_Mesh_5G"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm focus:outline-none focus:border-[var(--vl-accent)]"
                />
              </div>
              <div>
                <label htmlFor="ef-wsec" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Security
                </label>
                <select
                  id="ef-wsec"
                  value={wifiSecurity}
                  onChange={(e) => setWifiSecurity(e.target.value as 'WPA3' | 'WPA2' | 'WEP' | 'Open')}
                  className="w-full h-11 px-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm focus:outline-none focus:border-[var(--vl-accent)]"
                >
                  <option value="WPA3">WPA3</option>
                  <option value="WPA2">WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="Open">Open</option>
                </select>
              </div>
            </div>
          )}

          {(type === 'LOGIN' || type === 'BANK' || type === 'WIFI') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="ef-pw" className="text-xs font-medium text-[var(--vl-text-secondary)]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleQuickGenerate}
                  className="text-xs font-medium text-[var(--vl-accent)] hover:underline inline-flex items-center gap-1"
                >
                  <Dices className="w-3.5 h-3.5" />
                  <span>Generate strong</span>
                </button>
              </div>
              <div className="relative">
                <input
                  id="ef-pw"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter or generate password"
                  className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret focus:outline-none focus:border-[var(--vl-accent)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--vl-text-secondary)]"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <StrengthMeter password={password} showFeedback={false} />
            </div>
          )}

          {type === 'CARD' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="ef-cholder" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Cardholder name
                </label>
                <input
                  id="ef-cholder"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ef-cnum" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Card number
                </label>
                <input
                  id="ef-cnum"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4532 8910 3421 8842"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
                />
              </div>
              <div>
                <label htmlFor="ef-cexp" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Expiry (MM/YY)
                </label>
                <input
                  id="ef-cexp"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="09/29"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
                />
              </div>
              <div>
                <label htmlFor="ef-ccvv" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  CVV / PIN
                </label>
                <input
                  id="ef-ccvv"
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value)}
                  placeholder="742"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
                />
              </div>
            </div>
          )}

          {type === 'BANK' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ef-bacc" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Account number
                </label>
                <input
                  id="ef-bacc"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
                />
              </div>
              <div>
                <label htmlFor="ef-bifsc" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  IFSC / Routing
                </label>
                <input
                  id="ef-bifsc"
                  value={bankIfsc}
                  onChange={(e) => setBankIfsc(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
                />
              </div>
              <div>
                <label htmlFor="ef-upi" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  UPI ID
                </label>
                <input
                  id="ef-upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="name@okbank"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm"
                />
              </div>
              <div>
                <label htmlFor="ef-pin" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  MPIN / UPI PIN
                </label>
                <input
                  id="ef-pin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="4821"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
                />
              </div>
            </div>
          )}

          {type === 'IDENTITY' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ef-idname" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Full name
                </label>
                <input
                  id="ef-idname"
                  value={identityFullName}
                  onChange={(e) => setIdentityFullName(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm"
                />
              </div>
              <div>
                <label htmlFor="ef-iddoc" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Document / ID number
                </label>
                <input
                  id="ef-iddoc"
                  value={identityDocNumber}
                  onChange={(e) => setIdentityDocNumber(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
                />
              </div>
              <div>
                <label htmlFor="ef-idemail" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Email
                </label>
                <input
                  id="ef-idemail"
                  value={identityEmail}
                  onChange={(e) => setIdentityEmail(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm"
                />
              </div>
              <div>
                <label htmlFor="ef-idphone" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Phone
                </label>
                <input
                  id="ef-idphone"
                  value={identityPhone}
                  onChange={(e) => setIdentityPhone(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ef-idaddr" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Address
                </label>
                <input
                  id="ef-idaddr"
                  value={identityAddress}
                  onChange={(e) => setIdentityAddress(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm"
                />
              </div>
            </div>
          )}

          {(type === 'LOGIN' || type === 'BANK' || type === 'CARD') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ef-urls" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  Website URLs (comma-separated)
                </label>
                <input
                  id="ef-urls"
                  value={urlsText}
                  onChange={(e) => setUrlsText(e.target.value)}
                  placeholder="https://github.com"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm"
                />
              </div>
              <div>
                <label htmlFor="ef-totp" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
                  2FA / TOTP Secret (Base32)
                </label>
                <input
                  id="ef-totp"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  placeholder="JBSWY3DPEHPK3PXP"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm font-mono-secret"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="ef-tags" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
              Tags (comma-separated)
            </label>
            <input
              id="ef-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="work, banking, personal"
              className="w-full h-11 px-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm"
            />
          </div>

          <div>
            <label htmlFor="ef-notes" className="block text-xs font-medium text-[var(--vl-text-secondary)] mb-1">
              Notes
            </label>
            <textarea
              id="ef-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Security hints or recovery instructions…"
              className="w-full p-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm focus:outline-none focus:border-[var(--vl-accent)]"
            />
          </div>

          {/* Custom Fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--vl-text-secondary)]">Custom fields</span>
              <button
                type="button"
                onClick={() =>
                  setCustomFields((prev) => [
                    ...prev,
                    { id: generateUuid(), label: '', value: '', sensitive: false },
                  ])
                }
                className="text-xs font-medium text-[var(--vl-accent)] inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add field</span>
              </button>
            </div>
            {customFields.map((cf, idx) => (
              <div key={cf.id} className="flex items-center gap-2">
                <input
                  value={cf.label}
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                    )
                  }
                  placeholder="Label"
                  className="w-1/3 h-10 px-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-xs"
                />
                <input
                  value={cf.value}
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item))
                    )
                  }
                  placeholder="Value"
                  className="flex-1 h-10 px-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-xs"
                />
                <button
                  type="button"
                  onClick={() => setCustomFields((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Remove custom field"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--vl-text-secondary)] hover:text-[var(--vl-weak)]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl border border-[var(--vl-border)] text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="flex-1 h-11 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              {saving ? 'Encrypting…' : 'Save encrypted entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
