import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Dices,
  KeyRound,
  Lock,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AboutSecurityView } from './components/AboutSecurityView';
import { AuditView } from './components/AuditView';
import { BackupView } from './components/BackupView';
import { EntryFormModal } from './components/EntryFormModal';
import { GeneratorView } from './components/GeneratorView';
import { LockScreen } from './components/LockScreen';
import { OnboardingFlow } from './components/OnboardingFlow';
import { RecycleBinView } from './components/RecycleBinView';
import { SettingsView } from './components/SettingsView';
import { SmartImportView } from './components/SmartImportView';
import { VaultView } from './components/VaultView';
import { CountdownRing } from './components/ui/CountdownRing';
import { enableQuickUnlockOnMeta, generateUuid, sealEntry, wipeBytes } from './core/crypto';
import { t } from './core/i18n';
import {
  bootstrapDemoVault,
  DEFAULT_SETTINGS,
  loadVaultBundle,
  saveVaultBundle,
  sealAllEntries,
  wipeEntireVault,
} from './core/storage';
import type {
  AppRoute,
  DecryptedEntry,
  EntryJson,
  ImportTemplate,
  LanguageCode,
  ParsedRecord,
  VaultSettings,
  VaultStorageBundle,
} from './types/vault';

export default function App() {
  const [bundle, setBundle] = useState<VaultStorageBundle | null>(() => loadVaultBundle());
  const [entries, setEntries] = useState<DecryptedEntry[]>([]);
  const rawVaultKeyRef = useRef<Uint8Array | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [route, setRoute] = useState<AppRoute>('vault');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<DecryptedEntry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [prefillPassword, setPrefillPassword] = useState('');
  const [isBlurred, setIsBlurred] = useState(false);
  const [onboardingLang] = useState<LanguageCode>('en');
  const [isAutostarting, setIsAutostarting] = useState(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1'
  );

  // Clipboard auto-clear state
  const [clipboardNotice, setClipboardNotice] = useState<{
    label: string;
    remaining: number;
    total: number;
  } | null>(null);

  const settings = bundle?.settings ?? DEFAULT_SETTINGS;
  const lang = settings.language;

  // Apply theme & reduced motion classes on documentElement
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'amoled', 'reduce-motion');
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else if (settings.theme === 'amoled') {
      root.classList.add('dark', 'amoled');
    }
    if (settings.reduceAnimations) {
      root.classList.add('reduce-motion');
    }
  }, [settings.theme, settings.reduceAnimations]);

  // ?autostart=1 deterministic bootstrap for rapid testing (runs once on initial mount)
  const didAutostartRef = useRef(false);
  useEffect(() => {
    if (didAutostartRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      didAutostartRef.current = true;
      bootstrapDemoVault()
        .then(({ bundle: demoBundle, rawVaultKey, entries: demoEntries }) => {
          rawVaultKeyRef.current = rawVaultKey;
          setBundle(demoBundle);
          setEntries(demoEntries);
          setSelectedEntryId(demoEntries[0]?.id ?? null);
          setIsUnlocked(true);
        })
        .finally(() => setIsAutostarting(false));
    }
  }, []);

  const lockVault = useCallback(() => {
    wipeBytes(rawVaultKeyRef.current);
    rawVaultKeyRef.current = null;
    setEntries([]);
    setSelectedEntryId(null);
    setEditingEntry(null);
    setIsFormOpen(false);
    setIsUnlocked(false);
    setIsBlurred(false);
  }, []);

  // Auto-lock on inactivity & privacy blur on window blur
  useEffect(() => {
    if (!isUnlocked) return;

    let idleTimer: number | null = null;
    const resetIdle = () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      if (settings.autoLockSeconds > 0) {
        idleTimer = window.setTimeout(() => {
          lockVault();
        }, settings.autoLockSeconds * 1000);
      }
    };

    resetIdle();
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));

    const handleVisibility = () => {
      if (document.hidden) {
        if (settings.privacyShieldEnabled) setIsBlurred(true);
        if (settings.autoLockSeconds === 0) lockVault();
      } else {
        setIsBlurred(false);
      }
    };

    const handleBlur = () => {
      if (settings.privacyShieldEnabled) setIsBlurred(true);
    };
    const handleFocus = () => {
      setIsBlurred(false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isUnlocked, settings.autoLockSeconds, settings.privacyShieldEnabled, lockVault]);

  // Clipboard countdown timer
  const clearClipboardNow = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText('');
    } catch {
      // Clipboard API may be restricted in headless contexts
    }
    setClipboardNotice(null);
  }, []);

  useEffect(() => {
    if (!clipboardNotice || clipboardNotice.total <= 0) return;
    const timer = window.setInterval(() => {
      setClipboardNotice((prev) => {
        if (!prev) return null;
        if (prev.remaining <= 1) {
          clearClipboardNow();
          return null;
        }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [clipboardNotice?.label, clipboardNotice?.total, clearClipboardNow]);

  const handleCopySecret = async (label: string, value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      // Ignore permission restrictions in automated headless checks
    }
    const timeout = settings.clipboardClearSeconds;
    setClipboardNotice({
      label,
      remaining: timeout > 0 ? timeout : 3,
      total: timeout,
    });
    if (timeout === 0) {
      window.setTimeout(() => setClipboardNotice(null), 2000);
    }
  };

  const persistEntries = async (nextEntries: DecryptedEntry[], nextBundlePatch?: Partial<VaultStorageBundle>) => {
    const vk = rawVaultKeyRef.current;
    if (!vk || !bundle) return;
    const sealedRows = await sealAllEntries(vk, nextEntries);
    const updatedBundle: VaultStorageBundle = {
      ...bundle,
      ...nextBundlePatch,
      entries: sealedRows,
    };
    saveVaultBundle(updatedBundle);
    setBundle(updatedBundle);
    setEntries(nextEntries);
  };

  const handleSaveEntry = async (data: EntryJson, existingId?: string) => {
    const vk = rawVaultKeyRef.current;
    if (!vk || !bundle) return;
    const now = Date.now();

    let nextEntries: DecryptedEntry[];
    let targetId = existingId;

    if (existingId) {
      nextEntries = entries.map((item) => {
        if (item.id !== existingId) return item;
        const oldPw = item.data.password;
        const newPw = data.password;
        const nextHistory =
          oldPw && newPw && oldPw !== newPw
            ? [{ password: oldPw, savedAt: item.updatedAt }, ...item.history].slice(0, 10)
            : item.history;
        return {
          ...item,
          data,
          updatedAt: now,
          history: nextHistory,
        };
      });
    } else {
      targetId = generateUuid();
      const created: DecryptedEntry = {
        id: targetId,
        data,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        history: [],
      };
      nextEntries = [created, ...entries];
    }

    // Seal only changed entry for speed + save
    const targetEntry = nextEntries.find((e) => e.id === targetId)!;
    const sealedTarget = await sealEntry(vk, targetEntry);
    const nextRows = existingId
      ? bundle.entries.map((r) => (r.id === existingId ? sealedTarget : r))
      : [sealedTarget, ...bundle.entries];

    const updatedBundle: VaultStorageBundle = { ...bundle, entries: nextRows };
    saveVaultBundle(updatedBundle);
    setBundle(updatedBundle);
    setEntries(nextEntries);
    setSelectedEntryId(targetId ?? null);
    setPrefillPassword('');
  };

  const handleDeleteEntry = async (id: string) => {
    const nextEntries = entries.map((e) =>
      e.id === id ? { ...e, deletedAt: Date.now() } : e
    );
    await persistEntries(nextEntries);
    if (selectedEntryId === id) setSelectedEntryId(null);
  };

  const handleRestoreEntry = async (id: string) => {
    const nextEntries = entries.map((e) =>
      e.id === id ? { ...e, deletedAt: null, updatedAt: Date.now() } : e
    );
    await persistEntries(nextEntries);
  };

  const handleDeleteForever = async (id: string) => {
    const nextEntries = entries.filter((e) => e.id !== id);
    await persistEntries(nextEntries);
  };

  const handleEmptyBin = async () => {
    const nextEntries = entries.filter((e) => e.deletedAt === null);
    await persistEntries(nextEntries);
  };

  const handleToggleFavourite = async (entry: DecryptedEntry) => {
    await handleSaveEntry(
      { ...entry.data, favourite: !entry.data.favourite },
      entry.id
    );
  };

  const handleRestoreHistoryPassword = async (entry: DecryptedEntry, oldPassword: string) => {
    await handleSaveEntry({ ...entry.data, password: oldPassword }, entry.id);
  };

  const handleSaveImportedRecords = async (records: ParsedRecord[]): Promise<number> => {
    const now = Date.now();
    const nextEntries = [...entries];
    let savedCount = 0;

    for (const rec of records) {
      if (rec.dedupeAction === 'skip') continue;

      const entryData: EntryJson = {
        type: rec.detectedType,
        title: rec.fields.account?.token || 'Imported Entry',
        username: rec.fields.username?.token,
        password: rec.fields.password?.token,
        urls: rec.fields.url?.token ? [rec.fields.url.token] : [],
        pin: rec.fields.pin?.token,
        totpSecret: rec.fields.totp?.token,
        notes: [rec.fields.notes?.token, ...rec.extraNotes].filter(Boolean).join('\n') || undefined,
        tags: ['imported'],
        favourite: false,
        customFields: [],
        source: 'smart-import',
      };

      if (rec.duplicateOfId && rec.dedupeAction === 'update') {
        const idx = nextEntries.findIndex((e) => e.id === rec.duplicateOfId);
        if (idx !== -1) {
          const prev = nextEntries[idx];
          const oldPw = prev.data.password;
          const nextHistory =
            oldPw && entryData.password && oldPw !== entryData.password
              ? [{ password: oldPw, savedAt: prev.updatedAt }, ...prev.history].slice(0, 10)
              : prev.history;
          nextEntries[idx] = {
            ...prev,
            data: {
              ...prev.data,
              ...entryData,
              tags: Array.from(new Set([...prev.data.tags, ...entryData.tags])),
            },
            updatedAt: now,
            history: nextHistory,
          };
          savedCount++;
          continue;
        }
      }

      nextEntries.unshift({
        id: generateUuid(),
        data: entryData,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        history: [],
      });
      savedCount++;
    }

    await persistEntries(nextEntries);
    setRoute('vault');
    return savedCount;
  };

  const handleSaveTemplate = (template: ImportTemplate) => {
    if (!bundle) return;
    const updatedBundle: VaultStorageBundle = {
      ...bundle,
      templates: [template, ...bundle.templates],
    };
    saveVaultBundle(updatedBundle);
    setBundle(updatedBundle);
  };

  const handleDeleteTemplate = (id: string) => {
    if (!bundle) return;
    const updatedBundle: VaultStorageBundle = {
      ...bundle,
      templates: bundle.templates.filter((tpl) => tpl.id !== id),
    };
    saveVaultBundle(updatedBundle);
    setBundle(updatedBundle);
  };

  const handleUpdateSettings = async (patch: Partial<VaultSettings>) => {
    if (!bundle) return;
    let nextMeta = bundle.meta;
    if (typeof patch.quickUnlockEnabled === 'boolean' && rawVaultKeyRef.current) {
      nextMeta = await enableQuickUnlockOnMeta(
        bundle.meta,
        rawVaultKeyRef.current,
        patch.quickUnlockEnabled
      );
    }
    const updatedBundle: VaultStorageBundle = {
      ...bundle,
      meta: nextMeta,
      settings: { ...bundle.settings, ...patch },
    };
    saveVaultBundle(updatedBundle);
    setBundle(updatedBundle);
  };

  const handleLoadDemo = async () => {
    const { bundle: demoBundle, rawVaultKey, entries: demoEntries } = await bootstrapDemoVault();
    rawVaultKeyRef.current = rawVaultKey;
    setBundle(demoBundle);
    setEntries(demoEntries);
    setSelectedEntryId(demoEntries[0]?.id ?? null);
    setIsUnlocked(true);
  };

  if (isAutostarting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--vl-bg)] text-[var(--vl-text-secondary)] text-sm">
        Unlocking sample vault…
      </div>
    );
  }

  // Gate 1: No vault initialized -> Onboarding
  if (!bundle) {
    return (
      <OnboardingFlow
        language={onboardingLang}
        onLoadDemo={handleLoadDemo}
        onComplete={({ bundle: newBundle, rawVaultKey, entries: initEntries, openSmartImport }) => {
          rawVaultKeyRef.current = rawVaultKey;
          setBundle(newBundle);
          setEntries(initEntries);
          setSelectedEntryId(initEntries[0]?.id ?? null);
          setIsUnlocked(true);
          if (openSmartImport) setRoute('import');
        }}
      />
    );
  }

  // Gate 2: Vault exists but locked -> Lock Screen
  if (!isUnlocked) {
    return (
      <LockScreen
        bundle={bundle}
        onUnlock={({ bundle: nextBundle, rawVaultKey, entries: unlockedEntries }) => {
          rawVaultKeyRef.current = rawVaultKey;
          setBundle(nextBundle);
          setEntries(unlockedEntries);
          setSelectedEntryId(unlockedEntries.find((e) => e.deletedAt === null)?.id ?? null);
          setIsUnlocked(true);
        }}
        onWiped={() => {
          rawVaultKeyRef.current = null;
          setBundle(null);
          setEntries([]);
          setIsUnlocked(false);
        }}
      />
    );
  }

  const trashCount = entries.filter((e) => e.deletedAt !== null).length;

  const navItems: Array<{ id: AppRoute; label: string; icon: React.ReactNode }> = [
    { id: 'vault', label: t(lang, 'vault'), icon: <KeyRound className="w-4 h-4" /> },
    { id: 'import', label: t(lang, 'smartImport'), icon: <Sparkles className="w-4 h-4" /> },
    { id: 'generator', label: t(lang, 'generator'), icon: <Dices className="w-4 h-4" /> },
    { id: 'audit', label: t(lang, 'audit'), icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'backup', label: t(lang, 'backup'), icon: <ArchiveRestore className="w-4 h-4" /> },
    {
      id: 'recycle',
      label: trashCount > 0 ? `${t(lang, 'recycleBin')} (${trashCount})` : t(lang, 'recycleBin'),
      icon: <Trash2 className="w-4 h-4" />,
    },
    { id: 'settings', label: t(lang, 'settings'), icon: <Settings className="w-4 h-4" /> },
    { id: 'security', label: t(lang, 'aboutSecurity'), icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--vl-bg)] text-[var(--vl-text-primary)] flex flex-col md:flex-row">
      {/* Privacy Blur Shield Overlay */}
      {isBlurred && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-50 backdrop-blur-2xl bg-[var(--vl-bg)]/85 flex items-center justify-center"
        >
          <div className="text-center space-y-2">
            <Lock className="w-8 h-8 mx-auto text-[var(--vl-accent)]" />
            <p className="text-sm font-medium">Vaultline privacy shield active</p>
          </div>
        </div>
      )}

      {/* Desktop Left Navigation Rail */}
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col justify-between border-r border-[var(--vl-border)] bg-[var(--vl-surface)] p-4">
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[var(--vl-accent-soft)] text-[var(--vl-accent)] flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-base font-semibold tracking-tight whitespace-nowrap">
                Vaultline
              </span>
            </div>
          </div>

          <nav aria-label="Main navigation" className="space-y-1">
            {navItems.map((item) => {
              const active = route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRoute(item.id)}
                  className={`w-full h-10 px-3 rounded-xl flex items-center gap-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[var(--vl-accent-soft)] text-[var(--vl-accent)]'
                      : 'text-[var(--vl-text-secondary)] hover:text-[var(--vl-text-primary)] hover:bg-[var(--vl-surface-muted)]'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 pt-4 border-t border-[var(--vl-border)]">
          <button
            type="button"
            onClick={lockVault}
            className="w-full h-10 px-3 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-xs font-medium flex items-center justify-center gap-2"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{t(lang, 'lockVault')}</span>
          </button>
          <p className="text-[11px] text-[var(--vl-text-secondary)] text-center">
            {t(lang, 'offlineVerified')}
          </p>
        </div>
      </aside>

      {/* Mobile Compact Top Header (48px) */}
      <header className="md:hidden sticky top-0 z-30 h-12 px-4 bg-[var(--vl-surface)]/95 backdrop-blur-md border-b border-[var(--vl-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--vl-accent)]" />
          <span className="text-sm font-semibold tracking-tight">Vaultline</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRoute('audit')}
            aria-label={t(lang, 'audit')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--vl-text-secondary)]"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={lockVault}
            aria-label={t(lang, 'lockVault')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--vl-text-secondary)]"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto">
        {route === 'vault' && (
          <VaultView
            entries={entries}
            language={lang}
            selectedId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
            onAddEntry={() => {
              setEditingEntry(null);
              setPrefillPassword('');
              setIsFormOpen(true);
            }}
            onOpenSmartImport={() => setRoute('import')}
            onEditEntry={(entry) => {
              setEditingEntry(entry);
              setPrefillPassword('');
              setIsFormOpen(true);
            }}
            onDeleteEntry={handleDeleteEntry}
            onToggleFavourite={handleToggleFavourite}
            onRestoreHistoryPassword={handleRestoreHistoryPassword}
            onCopySecret={handleCopySecret}
            activeCopyLabel={clipboardNotice?.label ?? null}
            copyRemainingSeconds={clipboardNotice?.remaining ?? 0}
            copyTotalSeconds={clipboardNotice?.total ?? 0}
          />
        )}

        {route === 'import' && (
          <SmartImportView
            existingEntries={entries}
            templates={bundle.templates}
            language={lang}
            onSaveImportedRecords={handleSaveImportedRecords}
            onSaveTemplate={handleSaveTemplate}
          />
        )}

        {route === 'generator' && (
          <GeneratorView
            language={lang}
            onCopySecret={handleCopySecret}
            onSaveToVault={(pw) => {
              setEditingEntry(null);
              setPrefillPassword(pw);
              setIsFormOpen(true);
            }}
            activeCopyLabel={clipboardNotice?.label ?? null}
            copyRemainingSeconds={clipboardNotice?.remaining ?? 0}
            copyTotalSeconds={clipboardNotice?.total ?? 0}
          />
        )}

        {route === 'audit' && (
          <AuditView
            entries={entries}
            language={lang}
            onEditEntry={(entry) => {
              setEditingEntry(entry);
              setPrefillPassword('');
              setIsFormOpen(true);
            }}
          />
        )}

        {route === 'backup' && (
          <BackupView
            meta={bundle.meta}
            entries={entries}
            lastBackupAt={settings.lastBackupAt}
            language={lang}
            onBackupCreated={() => handleUpdateSettings({ lastBackupAt: Date.now() })}
            onRestoreEntries={async (restored) => {
              const existingIds = new Set(entries.map((e) => e.id));
              const merged = [...entries];
              for (const r of restored) {
                if (!existingIds.has(r.id)) merged.push(r);
              }
              await persistEntries(merged);
            }}
          />
        )}

        {route === 'recycle' && (
          <RecycleBinView
            entries={entries}
            language={lang}
            onRestore={handleRestoreEntry}
            onDeleteForever={handleDeleteForever}
            onEmptyBin={handleEmptyBin}
          />
        )}

        {route === 'settings' && (
          <div className="space-y-6">
            {/* Mobile quick links to Backup, Recycle Bin, Security */}
            <div className="md:hidden grid grid-cols-3 gap-2 max-w-3xl mx-auto">
              <button
                type="button"
                onClick={() => setRoute('backup')}
                className="p-3 rounded-xl bg-[var(--vl-surface)] border border-[var(--vl-border)] text-xs font-medium text-center"
              >
                {t(lang, 'backup')}
              </button>
              <button
                type="button"
                onClick={() => setRoute('recycle')}
                className="p-3 rounded-xl bg-[var(--vl-surface)] border border-[var(--vl-border)] text-xs font-medium text-center"
              >
                {t(lang, 'recycleBin')}
              </button>
              <button
                type="button"
                onClick={() => setRoute('security')}
                className="p-3 rounded-xl bg-[var(--vl-surface)] border border-[var(--vl-border)] text-xs font-medium text-center"
              >
                {t(lang, 'aboutSecurity')}
              </button>
            </div>
            <SettingsView
              settings={settings}
              templates={bundle.templates}
              onUpdateSettings={handleUpdateSettings}
              onDeleteTemplate={handleDeleteTemplate}
              onWipeVault={async () => {
                await wipeEntireVault();
                rawVaultKeyRef.current = null;
                setBundle(null);
                setEntries([]);
                setIsUnlocked(false);
              }}
            />
          </div>
        )}

        {route === 'security' && <AboutSecurityView meta={bundle.meta} language={lang} />}
      </main>

      {/* Clipboard Auto-Clear Countdown Toast (positioned above header on mobile so it never overlaps FAB) */}
      {clipboardNotice && clipboardNotice.total > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-4 right-4 md:top-auto md:left-auto md:bottom-5 md:right-5 z-40 rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] shadow-lg px-4 py-2.5 flex items-center justify-between md:justify-start gap-3 animate-vl-rise"
        >
          <div className="flex items-center gap-2.5">
            <CountdownRing
              remainingSeconds={clipboardNotice.remaining}
              totalSeconds={clipboardNotice.total}
              size={22}
              strokeWidth={2.5}
              className="text-[var(--vl-accent)]"
            />
            <div className="text-xs">
              <span className="font-medium">{clipboardNotice.label} copied</span>
              <span className="text-[var(--vl-text-secondary)] tabular-nums">
                {' '}· clears in {clipboardNotice.remaining}s
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={clearClipboardNow}
              aria-label="Clear clipboard now"
              className="text-xs font-medium text-[var(--vl-accent)] hover:underline"
            >
              {t(lang, 'clearNow')}
            </button>
            <button
              type="button"
              onClick={() => setClipboardNotice(null)}
              aria-label="Dismiss clipboard notification"
              className="text-[var(--vl-text-secondary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation (64px height -> combined with 48px header = 112px / 844px = 13.2% <= 15% cap) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-[var(--vl-surface)]/95 backdrop-blur-md border-t border-[var(--vl-border)] grid grid-cols-4 items-center"
      >
        {[
          { id: 'vault' as AppRoute, label: t(lang, 'vault'), icon: KeyRound },
          { id: 'import' as AppRoute, label: 'Import', icon: Sparkles },
          { id: 'generator' as AppRoute, label: t(lang, 'generator'), icon: Dices },
          { id: 'settings' as AppRoute, label: t(lang, 'settings'), icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          const active = route === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRoute(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? 'text-[var(--vl-accent)]' : 'text-[var(--vl-text-secondary)]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Floating "+" Add Button on Vault Tab */}
      {route === 'vault' && !selectedEntryId && (
        <button
          type="button"
          onClick={() => {
            setEditingEntry(null);
            setPrefillPassword('');
            setIsFormOpen(true);
          }}
          aria-label="Add new entry"
          className="md:hidden fixed bottom-20 right-4 z-30 w-12 h-12 rounded-2xl bg-[var(--vl-accent-btn)] text-white shadow-lg flex items-center justify-center"
        >
          <Plus className="w-5 h-5" />
        </button>
      )}

      {/* Add / Edit Entry Modal */}
      {isFormOpen && (
        <EntryFormModal
          initialEntry={editingEntry}
          defaultPassword={prefillPassword}
          onSave={handleSaveEntry}
          onClose={() => {
            setIsFormOpen(false);
            setEditingEntry(null);
            setPrefillPassword('');
          }}
        />
      )}
    </div>
  );
}
