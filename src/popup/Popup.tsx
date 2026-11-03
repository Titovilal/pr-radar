import { useEffect, useState, type ButtonHTMLAttributes } from "react";
import { ArrowUpIcon, CheckIcon, RefreshIcon, SettingsIcon } from "../lib/icons";
import { chips, timeAgo, type Tone } from "../lib/status";
import { save, signature, visibleItems } from "../lib/storage";
import type { Dismissed, Item } from "../lib/types";
import { useStored } from "../lib/useStored";

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  blue: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300",
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400",
};

const LAST_TAB_KEY = "pr-radar:last-tab";

export function Popup() {
  const settings = useStored("settings");
  const snapshot = useStored("snapshot");
  const dismissed = useStored("dismissed") ?? {};
  const [tab, setTab] = useState(() => localStorage.getItem(LAST_TAB_KEY) ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!settings) return null;

  const views = settings.views;
  const active = views.find((v) => v.id === tab) ?? views[0];
  const result = active ? snapshot?.results[active.id] : undefined;
  const all = result?.items ?? [];
  const visible = visibleItems(all, dismissed);
  const hiddenCount = all.length - visible.length;
  const shown = showHidden ? all : visible;

  const selectTab = (id: string) => {
    setTab(id);
    setShowHidden(false);
    localStorage.setItem(LAST_TAB_KEY, id);
  };

  const refresh = async () => {
    setRefreshing(true);
    await chrome.runtime.sendMessage({ type: "poll" }).catch(() => undefined);
    setRefreshing(false);
  };

  const toggleDismiss = (item: Item) => {
    const next: Dismissed = { ...dismissed };
    if (next[item.id] === signature(item)) delete next[item.id];
    else next[item.id] = signature(item);
    void save("dismissed", next);
  };

  return (
    <div className="flex max-h-[580px] w-[420px] flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <img src="/icons/32.png" alt="" className="size-5" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">PR Radar</h1>
          <p className="truncate text-xs text-zinc-500">
            {snapshot?.login ? `@${snapshot.login} · ` : ""}
            {snapshot?.fetchedAt ? `actualizado ${timeAgo(snapshot.fetchedAt)}` : "sin datos aún"}
          </p>
        </div>
        <IconButton label="Actualizar" onClick={refresh} disabled={refreshing}>
          <RefreshIcon className={refreshing ? "animate-spin" : ""} />
        </IconButton>
        <IconButton label="Ajustes" onClick={() => chrome.runtime.openOptionsPage()}>
          <SettingsIcon />
        </IconButton>
      </header>

      {snapshot?.error && <ErrorBanner error={snapshot.error} />}

      <nav className="flex gap-1 border-b border-zinc-200 px-2 dark:border-zinc-800" role="tablist">
        {views.map((view) => {
          const count = visibleItems(snapshot?.results[view.id]?.items ?? [], dismissed).length;
          const selected = view.id === active?.id;
          return (
            <button
              key={view.id}
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(view.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors ${
                selected
                  ? "border-indigo-500 text-zinc-900 dark:text-zinc-50"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {view.name}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] tabular-nums ${
                    view.badge
                      ? "bg-rose-500 text-white"
                      : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <main className="min-h-40 flex-1 overflow-y-auto">
        {result?.error && <p className="px-4 py-3 text-xs text-rose-600">{result.error}</p>}
        {shown.length === 0 ? (
          <Empty hasData={Boolean(snapshot?.fetchedAt) && !snapshot?.error} />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
            {shown.map((item) => (
              <Row
                key={item.id}
                item={item}
                dismissed={dismissed[item.id] === signature(item)}
                onToggle={() => toggleDismiss(item)}
              />
            ))}
          </ul>
        )}
      </main>

      {hiddenCount > 0 && (
        <footer className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
          <button className="hover:text-zinc-800 dark:hover:text-zinc-200" onClick={() => setShowHidden((s) => !s)}>
            {showHidden ? "Ocultar las marcadas como hechas" : `${hiddenCount} marcadas como hechas · mostrar`}
          </button>
        </footer>
      )}
    </div>
  );
}

function Row({ item, dismissed, onToggle }: { item: Item; dismissed: boolean; onToggle: () => void }) {
  return (
    <li className={`group relative flex gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${dismissed ? "opacity-50" : ""}`}>
      {item.authorAvatar ? (
        <img src={avatar(item.authorAvatar)} alt="" className="mt-0.5 size-7 shrink-0 rounded-full" />
      ) : (
        <div className="mt-0.5 size-7 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      )}
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          onClick={(e) => {
            e.preventDefault();
            void chrome.tabs.create({ url: item.url });
          }}
          className="line-clamp-2 text-[13px] font-medium leading-snug after:absolute after:inset-0 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          {item.title}
        </a>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {item.repo}#{item.number} · {item.author} · {timeAgo(item.updatedAt)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips(item).map((chip) => (
            <span key={chip.label} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${TONES[chip.tone]}`}>
              {chip.label}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={onToggle}
        title={dismissed ? "Volver a mostrar" : "Marcar como hecha (vuelve si cambia)"}
        aria-label={dismissed ? "Volver a mostrar" : "Marcar como hecha"}
        className="relative z-10 self-center rounded-md p-1.5 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-800 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
      >
        {dismissed ? <ArrowUpIcon /> : <CheckIcon />}
      </button>
    </li>
  );
}

function avatar(url: string): string {
  const u = new URL(url);
  u.searchParams.set("s", "64");
  return u.toString();
}

function IconButton({
  label,
  children,
  ...props
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-60 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

function ErrorBanner({ error }: { error: string }) {
  if (error === "no-token") {
    return (
      <div className="m-3 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">
        <p className="font-medium">Conecta tu cuenta de GitHub</p>
        <p className="mt-0.5">Necesitas un token para leer tus PRs.</p>
        <button
          className="mt-2 rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-500"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Configurar
        </button>
      </div>
    );
  }
  return (
    <div className="m-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
      <span className="font-medium">No se pudo actualizar:</span> {error}
    </div>
  );
}

function Empty({ hasData }: { hasData: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">
      <p className="text-2xl">{hasData ? "🎉" : "📡"}</p>
      <p className="text-sm font-medium">{hasData ? "Nada pendiente" : "Esperando datos…"}</p>
      {hasData && <p className="text-xs text-zinc-500">Te aviso en cuanto llegue algo.</p>}
    </div>
  );
}
