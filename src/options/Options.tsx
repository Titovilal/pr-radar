import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { fetchViews } from "../lib/github";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "../lib/icons";
import { DEFAULT_VIEWS, load, save } from "../lib/storage";
import type { NotifyMode, Settings, View } from "../lib/types";
import { useStored } from "../lib/useStored";

const CLASSIC_TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=PR%20Radar";
const FINE_GRAINED_URL = "https://github.com/settings/personal-access-tokens/new";

const NOTIFY_LABELS: Record<NotifyMode, string> = {
  new: "Cuando aparece algo nuevo",
  change: "Cuando cambia review o CI",
  off: "Nunca",
};

const EXAMPLES: { label: string; query: string }[] = [
  { label: "Solo reviews directas a mí (sin equipos)", query: "is:pr is:open user-review-requested:@me archived:false" },
  { label: "PRs de un repo concreto", query: "is:pr is:open repo:owner/name" },
  { label: "Mis PRs aprobadas listas para mergear", query: "is:pr is:open author:@me review:approved" },
  { label: "Issues asignadas a mí", query: "is:issue is:open assignee:@me archived:false" },
];

const STATUS_TONES = { ok: "text-emerald-600", error: "text-rose-600", pending: "text-zinc-500" } as const;

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950";

export function Options() {
  const stored = useStored("settings");
  // Last saved settings; compared against the draft to know if there are unsaved changes.
  const [baseline, setBaseline] = useState<Settings>();
  const [draft, setDraft] = useState<Settings>();
  const [status, setStatus] = useState<{ tone: "ok" | "error" | "pending"; text: string }>();

  useEffect(() => {
    if (stored && !draft) {
      setDraft(stored);
      setBaseline(stored);
    }
  }, [stored, draft]);

  if (!draft) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const update = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch });
  const updateView = (index: number, patch: Partial<View>) =>
    update({ views: draft.views.map((v, i) => (i === index ? { ...v, ...patch } : v)) });
  const moveView = (index: number, delta: number) => {
    const views = [...draft.views];
    const [view] = views.splice(index, 1);
    views.splice(index + delta, 0, view!);
    update({ views });
  };

  const testToken = async () => {
    setStatus(undefined);
    try {
      const { login } = await fetchViews(draft.token.trim(), []);
      setStatus({ tone: "ok", text: `Conectado como @${login}` });
    } catch (err) {
      setStatus({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const persist = async () => {
    const next = { ...draft, token: draft.token.trim(), views: draft.views.filter((v) => v.query.trim()) };
    await save("settings", next);
    setDraft(next);
    setBaseline(next);
    setStatus({ tone: "pending", text: "Guardado. Actualizando…" });

    const done = chrome.runtime.sendMessage({ type: "poll" }).then(() => true, () => false);
    const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), 30_000));
    if (!(await Promise.race([done, timeout]))) {
      setStatus({
        tone: "error",
        text: "El servicio en segundo plano no responde. Recarga la extensión y mira si muestra errores.",
      });
      return;
    }

    const snapshot = await load("snapshot");
    if (snapshot?.error === "no-token") setStatus({ tone: "error", text: "Falta el token" });
    else if (snapshot?.error) setStatus({ tone: "error", text: `No se pudo actualizar: ${snapshot.error}` });
    else {
      const total = Object.values(snapshot?.results ?? {}).reduce((sum, r) => sum + r.items.length, 0);
      setStatus({ tone: "ok", text: `Listo · @${snapshot?.login} · ${total} elementos en tus vistas` });
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-32 sm:px-6">
      <header className="mb-8 flex items-center gap-3">
        <img src="/icons/48.png" alt="" className="size-10" />
        <div>
          <h1 className="text-xl font-semibold">PR Radar</h1>
          <p className="text-sm text-zinc-500">Tus avisos de GitHub, a tu manera.</p>
        </div>
      </header>

      <Section title="Cuenta de GitHub">
        <label className="mb-1.5 block text-sm font-medium" htmlFor="token">
          Token de acceso personal
        </label>
        <div className="flex gap-2">
          <input
            id="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="ghp_… o github_pat_…"
            className={input}
            value={draft.token}
            onChange={(e) => update({ token: e.target.value })}
          />
          <Button variant="secondary" onClick={testToken} disabled={!draft.token.trim()}>
            Probar
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Lo más sencillo es un{" "}
          <Link href={CLASSIC_TOKEN_URL}>token clásico con scope <code>repo</code></Link>. Si tu organización lo
          permite, también vale un <Link href={FINE_GRAINED_URL}>token fine-grained</Link> con acceso de lectura a
          Pull requests e Issues. El token se guarda solo en este navegador y únicamente se envía a{" "}
          <code>api.github.com</code>.
        </p>
      </Section>

      <Section title="Frecuencia">
        <select
          className={`${input} w-auto`}
          value={draft.pollMinutes}
          onChange={(e) => update({ pollMinutes: Number(e.target.value) })}
        >
          {[1, 2, 5, 10, 15].map((m) => (
            <option key={m} value={m}>
              Cada {m} {m === 1 ? "minuto" : "minutos"}
            </option>
          ))}
        </select>
      </Section>

      <Section
        title="Vistas"
        description={
          <>
            Cada vista es una búsqueda de GitHub (
            <Link href="https://docs.github.com/es/search-github/searching-on-github/searching-issues-and-pull-requests">
              sintaxis
            </Link>
            ) y sale como pestaña en el popup.
          </>
        }
      >
        <div className="space-y-3">
          {draft.views.map((view, i) => (
            <div key={view.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex gap-2">
                <input
                  aria-label="Nombre"
                  className={`${input} max-w-48 font-medium`}
                  value={view.name}
                  onChange={(e) => updateView(i, { name: e.target.value })}
                />
                <div className="flex-1" />
                <Ghost label="Subir" disabled={i === 0} onClick={() => moveView(i, -1)}>
                  <ArrowUpIcon />
                </Ghost>
                <Ghost label="Bajar" disabled={i === draft.views.length - 1} onClick={() => moveView(i, 1)}>
                  <ArrowDownIcon />
                </Ghost>
                <Ghost label="Borrar" onClick={() => update({ views: draft.views.filter((_, j) => j !== i) })}>
                  <TrashIcon />
                </Ghost>
              </div>
              <input
                aria-label="Búsqueda"
                spellCheck={false}
                className={`${input} mt-2 font-mono text-xs`}
                value={view.query}
                onChange={(e) => updateView(i, { query: e.target.value })}
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <span className="text-zinc-500">Avisar</span>
                  <select
                    className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
                    value={view.notify}
                    onChange={(e) => updateView(i, { notify: e.target.value as NotifyMode })}
                  >
                    {Object.entries(NOTIFY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-indigo-600"
                    checked={view.badge}
                    onChange={(e) => updateView(i, { badge: e.target.checked })}
                  />
                  Cuenta en el icono
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              update({
                views: [
                  ...draft.views,
                  { id: crypto.randomUUID(), name: "Nueva vista", query: "is:pr is:open ", notify: "new", badge: false },
                ],
              })
            }
          >
            Añadir vista
          </Button>
          <Button variant="secondary" onClick={() => update({ views: DEFAULT_VIEWS })}>
            Restaurar las de serie
          </Button>
        </div>

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            Ejemplos de búsquedas
          </summary>
          <ul className="mt-2 space-y-1.5">
            {EXAMPLES.map((ex) => (
              <li key={ex.query}>
                <span className="text-zinc-500">{ex.label}:</span>{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{ex.query}</code>
              </li>
            ))}
          </ul>
        </details>
      </Section>

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          {status && (
            <p className={`text-sm ${STATUS_TONES[status.tone]}`}>{status.text}</p>
          )}
          <div className="flex-1" />
          {dirty && (
            <Button variant="secondary" onClick={() => setDraft(baseline)}>
              Descartar
            </Button>
          )}
          <Button onClick={persist} disabled={!dirty}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Button({
  variant = "primary",
  ...props
}: { variant?: "primary" | "secondary" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-500"
      : "border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800";
  return (
    <button
      {...props}
      className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    />
  );
}

function Ghost({ label, ...props }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    />
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">
      {children}
    </a>
  );
}
