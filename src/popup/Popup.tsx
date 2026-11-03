import { useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import {
  ArrowUpIcon,
  CheckIcon,
  DraftPullRequestIcon,
  IssueIcon,
  PullRequestIcon,
  RefreshIcon,
  SettingsIcon,
} from "../lib/icons";
import { mentionPattern } from "../lib/mentions";
import { chips, MENTION_PLACES, REVIEW_TONES, REVIEW_VERBS, timeAgo, type Tone } from "../lib/status";
import { inRepos, save, signature, visibleItems } from "../lib/storage";
import type { Dismissed, Item, Mention, Review } from "../lib/types";
import { useStored } from "../lib/useStored";

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  blue: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300",
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400",
};

const DOT_TONES: Record<Tone, string> = {
  green: "bg-emerald-500",
  red: "bg-rose-500",
  amber: "bg-amber-500",
  blue: "bg-indigo-500",
  gray: "bg-zinc-400",
};

function openUrl(url: string) {
  return (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void chrome.tabs.create({ url });
  };
}

function avatar(url: string, size = 64): string {
  if (!url) return "";
  const u = new URL(url);
  u.searchParams.set("s", String(size));
  return u.toString();
}

export function Popup() {
  const settings = useStored("settings");
  const snapshot = useStored("snapshot");
  const dismissed = useStored("dismissed") ?? {};
  const [refreshing, setRefreshing] = useState(false);
  const [showHidden, setShowHidden] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState("");
  const mainRef = useRef<HTMLElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!settings) return null;

  const views = settings.views;
  const login = snapshot?.login ?? "";
  const sections = views.map((view) => {
    const result = snapshot?.results[view.id];
    const all = inRepos(result?.items ?? [], settings.repos);
    const visible = visibleItems(all, dismissed);
    return { view, error: result?.error, all, visible };
  });
  const nothingAtAll = sections.every((s) => s.all.length === 0 && !s.error);
  const currentId = current || views[0]?.id;

  // Scroll spy: the current section is the last one whose header has reached the top.
  const onScroll = () => {
    const main = mainRef.current;
    if (!main) return;
    let id = views[0]?.id ?? "";
    for (const el of main.querySelectorAll<HTMLElement>("section[data-view]")) {
      if (el.offsetTop - main.scrollTop <= 4) id = el.dataset.view!;
    }
    // At the bottom the last short sections can't reach the top, so highlight the last one.
    if (main.scrollTop + main.clientHeight >= main.scrollHeight - 2) id = views.at(-1)?.id ?? id;
    setCurrent(id);
  };

  const jumpTo = (id: string) => {
    const main = mainRef.current;
    const el = main?.querySelector<HTMLElement>(`section[data-view="${id}"]`);
    if (main && el) main.scrollTo({ top: el.offsetTop });
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

  const toggleHidden = (id: string) =>
    setShowHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-[600px] w-[460px] flex-col">
      <header className="flex items-start gap-3 border-b border-zinc-200 px-4 pt-3 pb-2.5 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <img src="/icons/32.png" alt="" className="size-6" />
            <h1 className="text-sm leading-tight font-semibold">PR Radar</h1>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            {login ? `@${login}` : ""}
            {settings.repos.length > 0 &&
              ` · ${settings.repos.length} ${settings.repos.length === 1 ? "repo" : "repos"}`}
            <br />
            {snapshot?.fetchedAt ? `actualizado hace ${timeAgo(snapshot.fetchedAt)}` : "sin datos aún"}
          </p>
          <div className="mt-1.5 -ml-1.5 flex gap-0.5">
            <IconButton label="Actualizar" onClick={refresh} disabled={refreshing}>
              <RefreshIcon className={refreshing ? "animate-spin" : ""} />
            </IconButton>
            <IconButton label="Ajustes" onClick={() => chrome.runtime.openOptionsPage()}>
              <SettingsIcon />
            </IconButton>
          </div>
        </div>

        <nav aria-label="Secciones" className="w-44 shrink-0">
          <ul className="flex flex-col gap-px">
            {sections.map(({ view, visible }) => {
              const selected = view.id === currentId;
              return (
                <li key={view.id}>
                  <button
                    onClick={() => jumpTo(view.id)}
                    aria-current={selected ? "true" : undefined}
                    className={`flex w-full items-center gap-2 rounded-md border-l-2 px-2 py-1 text-left text-xs transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                        : "border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    <span className="flex-1 truncate">{view.name}</span>
                    <Count n={visible.length} alert={view.badge} />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      {snapshot?.error && <ErrorBanner error={snapshot.error} />}

      <main ref={mainRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto">
        {nothingAtAll ? (
          <Empty hasData={Boolean(snapshot?.fetchedAt) && !snapshot?.error} />
        ) : (
          sections.map(({ view, error, all, visible }) => {
            const expanded = showHidden.has(view.id);
            const shown = expanded ? all : visible;
            const hiddenCount = all.length - visible.length;
            return (
              <section key={view.id} data-view={view.id} aria-labelledby={`h-${view.id}`}>
                <h2
                  id={`h-${view.id}`}
                  className="sticky top-0 z-20 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-4 py-2 text-xs font-semibold backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90"
                >
                  {view.name}
                  <Count n={visible.length} alert={view.badge} />
                  {view.description && (
                    <span className="truncate text-[11px] font-normal text-zinc-500">{view.description}</span>
                  )}
                </h2>
                {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
                {shown.length === 0 && !error ? (
                  <p className="px-4 py-3 text-xs text-zinc-400">Nada por aquí.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                    {shown.map((item) => (
                      <Row
                        key={item.id}
                        item={item}
                        viewId={view.id}
                        login={login}
                        dismissed={dismissed[item.id] === signature(item)}
                        onToggle={() => toggleDismiss(item)}
                      />
                    ))}
                  </ul>
                )}
                {hiddenCount > 0 && (
                  <button
                    className="px-4 pt-1 pb-3 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    onClick={() => toggleHidden(view.id)}
                  >
                    {expanded ? "Ocultar las marcadas como hechas" : `${hiddenCount} marcadas como hechas · mostrar`}
                  </button>
                )}
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}

function Count({ n, alert }: { n: number; alert: boolean }) {
  if (n === 0) return null;
  return (
    <span
      className={`min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium tabular-nums ${
        alert ? "bg-rose-500 text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
      }`}
    >
      {n}
    </span>
  );
}

function KindIcon({ item }: { item: Item }) {
  if (item.kind === "issue") return <IssueIcon className="text-emerald-600 dark:text-emerald-400" />;
  if (item.isDraft) return <DraftPullRequestIcon className="text-zinc-400" />;
  return <PullRequestIcon className="text-emerald-600 dark:text-emerald-400" />;
}

function Row({
  item,
  viewId,
  login,
  dismissed,
  onToggle,
}: {
  item: Item;
  viewId: string;
  login: string;
  dismissed: boolean;
  onToggle: () => void;
}) {
  const itemChips = chips(item, viewId);
  const isMine = item.author.toLowerCase() === login.toLowerCase();

  return (
    <li
      className={`group relative flex gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${dismissed ? "opacity-50" : ""}`}
    >
      <span className="mt-0.5 shrink-0" title={item.kind === "pr" ? "Pull request" : "Issue"}>
        <KindIcon item={item} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">
            {item.kind === "pr" ? (item.isDraft ? "PR draft" : "PR") : "Issue"}
          </span>
          <span>·</span>
          <span className="truncate">
            {item.repo.split("/")[1]} #{item.number}
          </span>
          <span>·</span>
          <span className="shrink-0">{timeAgo(item.updatedAt)}</span>
        </p>

        <a
          href={item.url}
          onClick={openUrl(item.url)}
          className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-medium after:absolute after:inset-0 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          {item.title}
        </a>

        {item.kind === "pr" && item.headRef && (
          <p className="mt-1 flex min-w-0 items-center gap-1 font-mono text-[10.5px] text-zinc-500">
            <span className="truncate rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800" title={item.headRef}>
              {item.headRef}
            </span>
            <span className="shrink-0">→</span>
            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{item.baseRef}</span>
            {!isMine && (
              <span className="ml-1 flex shrink-0 items-center gap-1 font-sans">
                {item.authorAvatar && <img src={avatar(item.authorAvatar, 32)} alt="" className="size-3.5 rounded-full" />}
                {item.author}
              </span>
            )}
          </p>
        )}

        {itemChips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {itemChips.map((chip) => (
              <span
                key={chip.label}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${TONES[chip.tone]}`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}

        {item.mention !== undefined && <MentionQuote mention={item.mention} login={login} />}
        {item.mention === undefined && isMine && item.lastReview && <ReviewLine review={item.lastReview} />}
      </div>

      <button
        onClick={onToggle}
        title={dismissed ? "Volver a mostrar" : "Marcar como hecha (vuelve si cambia algo)"}
        aria-label={dismissed ? "Volver a mostrar" : "Marcar como hecha"}
        className="relative z-10 self-start rounded-md p-1.5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200 hover:text-zinc-800 focus:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
      >
        {dismissed ? <ArrowUpIcon /> : <CheckIcon />}
      </button>
    </li>
  );
}

function ContextCard({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={openUrl(href)}
      className="relative z-10 mt-2 block rounded-lg border border-zinc-200 bg-zinc-50/80 px-2.5 py-2 transition hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-zinc-700/80 dark:bg-zinc-800/50 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/5"
    >
      {children}
    </a>
  );
}

function MentionQuote({ mention, login }: { mention: Mention | null; login: string }) {
  if (!mention) {
    return (
      <p className="mt-2 text-[11px] text-zinc-500 italic">
        No aparece tu @usuario: seguramente mencionaron a uno de tus equipos.
      </p>
    );
  }
  return (
    <ContextCard href={mention.url}>
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        {mention.authorAvatar && <img src={avatar(mention.authorAvatar, 32)} alt="" className="size-4 rounded-full" />}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{mention.author}</span>
        <span>
          te mencionó {MENTION_PLACES[mention.place]}
          {mention.path && <span className="font-mono"> · {mention.path.split("/").at(-1)}</span>}
        </span>
        <span className="ml-auto shrink-0">{timeAgo(mention.createdAt)}</span>
      </p>
      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
        <Highlighted text={mention.excerpt} login={login} />
      </p>
    </ContextCard>
  );
}

function Highlighted({ text, login }: { text: string; login: string }) {
  if (!login) return <>{text}</>;
  const pattern = mentionPattern(login);
  const match = pattern.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.index)}
      <mark className="rounded bg-amber-200/70 px-0.5 font-medium text-inherit dark:bg-amber-400/25">{match[0]}</mark>
      {text.slice(match.index + match[0].length)}
    </>
  );
}

function ReviewLine({ review }: { review: Review }) {
  return (
    <ContextCard href={review.url}>
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <span className={`size-1.5 shrink-0 rounded-full ${DOT_TONES[REVIEW_TONES[review.state]]}`} />
        {review.authorAvatar && <img src={avatar(review.authorAvatar, 32)} alt="" className="size-4 rounded-full" />}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{review.author}</span>
        <span>{REVIEW_VERBS[review.state]} tu PR</span>
        <span className="ml-auto shrink-0">{timeAgo(review.submittedAt)}</span>
      </p>
    </ContextCard>
  );
}

function IconButton({ label, children, ...props }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
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
      <div className="mx-3 mb-2 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">
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
    <div className="mx-3 mb-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
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
