import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { fetchRepos, fetchViews, searchRepos, type RepoOption } from "../lib/github";
import { CheckIcon, LockIcon, SearchIcon, TrashIcon, XIcon } from "../lib/icons";
import { timeAgo } from "../lib/status";
import { DEFAULT_CHANGE_TRIGGERS, DEFAULT_SETTINGS, DEFAULT_VIEWS, save } from "../lib/storage";
import type { ChangeTriggers, NotifyMode, Settings, View } from "../lib/types";
import { useStored } from "../lib/useStored";

const CLASSIC_TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=PR%20Radar";
const FINE_GRAINED_URL = "https://github.com/settings/personal-access-tokens/new";
const SEARCH_SYNTAX_URL =
  "https://docs.github.com/es/search-github/searching-on-github/searching-issues-and-pull-requests";

const TRIGGER_LABELS: Record<keyof ChangeTriggers, string> = {
  reviews: "Cuando alguien hace review",
  ci: "Cuando el CI pasa a verde o falla",
  commits: "Cuando suben commits nuevos",
};

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950";

type Connection = { state: "idle" | "checking" } | { state: "ok"; login: string } | { state: "error"; message: string };

export function Options() {
  const stored = useStored("settings");
  const [draft, setDraft] = useState<Settings>();
  const [savedAt, setSavedAt] = useState<number>();
  const firstLoad = useRef(true);

  useEffect(() => {
    if (stored && !draft) setDraft(stored);
  }, [stored, draft]);

  // Autosave everything except the token, which is saved explicitly on "Conectar".
  useEffect(() => {
    if (!draft || !stored) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const id = setTimeout(() => {
      void save("settings", { ...draft, token: stored.token }).then(() => setSavedAt(Date.now()));
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (!draft || !stored) return null;

  const update = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <header className="mb-8 flex items-center gap-3">
          <img src="/icons/48.png" alt="" className="size-10" />
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">PR Radar</h1>
            <p className="text-sm text-zinc-500">Solo los avisos de GitHub que tienen que ver contigo.</p>
          </div>
          <SavedIndicator savedAt={savedAt} />
        </header>

        <div className="space-y-5">
          <AccountCard
            token={stored.token}
            onConnected={(token) => {
              void save("settings", { ...draft, token }).then(() => setSavedAt(Date.now()));
              setDraft({ ...draft, token });
            }}
          />
          <ReposCard token={stored.token} repos={draft.repos} onChange={(repos) => update({ repos })} />
          <AlertsCard views={draft.views} onChange={(views) => update({ views })} />
          <Card title="Frecuencia" description="Cada cuánto se consulta GitHub.">
            <Segmented
              value={draft.pollMinutes}
              onChange={(pollMinutes) => update({ pollMinutes })}
              options={[1, 2, 5, 10, 15].map((m) => ({ value: m, label: `${m} min` }))}
            />
          </Card>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-500">
          <button
            className="hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
            onClick={() => {
              if (confirm("¿Restaurar avisos, frecuencia y repos a los valores de serie? El token se mantiene."))
                update({ ...DEFAULT_SETTINGS, token: draft.token });
            }}
          >
            Restaurar valores de serie
          </button>
        </p>
      </div>
    </div>
  );
}

function SavedIndicator({ savedAt }: { savedAt?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(id);
  }, [savedAt]);
  return (
    <span
      className={`flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-opacity duration-300 dark:bg-emerald-500/10 dark:text-emerald-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
    >
      <CheckIcon width={12} height={12} /> Guardado
    </span>
  );
}

/* ---------- Account ---------- */

function AccountCard({ token, onConnected }: { token: string; onConnected: (token: string) => void }) {
  const [editing, setEditing] = useState(!token);
  const [value, setValue] = useState("");
  const [conn, setConn] = useState<Connection>({ state: token ? "checking" : "idle" });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchViews(token, []).then(
      ({ login }) => !cancelled && setConn({ state: "ok", login }),
      (err: Error) => !cancelled && setConn({ state: "error", message: err.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  const connect = async () => {
    const candidate = value.trim();
    setConn({ state: "checking" });
    try {
      const { login } = await fetchViews(candidate, []);
      setConn({ state: "ok", login });
      setEditing(false);
      setValue("");
      onConnected(candidate);
    } catch (err) {
      setConn({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Card title="Cuenta de GitHub">
      {!editing && (
        <div className="flex items-center gap-3">
          <ConnectionBadge conn={conn} />
          <div className="flex-1" />
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Cambiar token
          </Button>
        </div>
      )}

      {editing && (
        <>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Pega aquí tu token: ghp_… o github_pat_…"
              className={input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && value.trim() && void connect()}
            />
            <Button onClick={connect} disabled={!value.trim() || conn.state === "checking"}>
              {conn.state === "checking" ? "Comprobando…" : "Conectar"}
            </Button>
            {token && (
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            )}
          </div>
          {conn.state === "error" && <p className="mt-2 text-sm text-rose-600">{conn.message}</p>}
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Lo más sencillo es un <Link href={CLASSIC_TOKEN_URL}>token clásico con permiso «repo»</Link>. También
            vale un <Link href={FINE_GRAINED_URL}>token fine-grained</Link> con lectura de pull requests e issues, si tu
            organización lo permite. Se guarda solo en este navegador y únicamente se envía a api.github.com.
          </p>
        </>
      )}
    </Card>
  );
}

function ConnectionBadge({ conn }: { conn: Connection }) {
  if (conn.state === "ok")
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="size-2 rounded-full bg-emerald-500" />
        Conectado como <strong className="font-semibold">@{conn.login}</strong>
      </span>
    );
  if (conn.state === "error")
    return (
      <span className="flex items-center gap-2 text-sm text-rose-600">
        <span className="size-2 rounded-full bg-rose-500" />
        {conn.message}
      </span>
    );
  return <span className="text-sm text-zinc-500">Comprobando conexión…</span>;
}

/* ---------- Repos ---------- */

function ReposCard({
  token,
  repos,
  onChange,
}: {
  token: string;
  repos: string[];
  onChange: (repos: string[]) => void;
}) {
  const [onlySome, setOnlySome] = useState(repos.length > 0);
  const [options, setOptions] = useState<RepoOption[]>();
  const [loadError, setLoadError] = useState<string>();
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!token || !onlySome || options) return;
    fetchRepos(token).then(setOptions, (err: Error) => setLoadError(err.message));
  }, [token, onlySome, options]);

  const selected = new Set(repos.map((r) => r.toLowerCase()));
  const toggle = (name: string) =>
    onChange(selected.has(name.toLowerCase()) ? repos.filter((r) => r.toLowerCase() !== name.toLowerCase()) : [...repos, name]);

  const q = filter.trim().toLowerCase();
  const [remote, setRemote] = useState<RepoOption[]>([]);

  // Ask GitHub too while typing: some repos the user can reach never show up in the listings.
  useEffect(() => {
    setRemote([]);
    if (!token || q.length < 2) return;
    let cancelled = false;
    const id = setTimeout(() => {
      searchRepos(token, q.split("/").at(-1)!).then(
        (found) => !cancelled && setRemote(found),
        () => undefined,
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [token, q]);

  const filtered = useMemo(() => {
    const local = (options ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
    const known = new Set(local.map((r) => r.name.toLowerCase()));
    const extra = remote.filter((r) => r.name.toLowerCase().includes(q) && !known.has(r.name.toLowerCase()));
    return [...local, ...extra];
  }, [options, remote, q]);
  const manual = /^[\w.-]+\/[\w.-]+$/.test(filter.trim()) && !filtered.some((r) => r.name.toLowerCase() === q);

  return (
    <Card title="Repositorios" description="Qué repos vigila PR Radar. El resto se ignora.">
      <Segmented
        value={onlySome ? "some" : "all"}
        onChange={(v) => {
          setOnlySome(v === "some");
          if (v === "all") onChange([]);
        }}
        options={[
          { value: "all", label: "Todos" },
          { value: "some", label: "Solo los que elija" },
        ]}
      />

      {onlySome && (
        <div className="mt-4">
          {repos.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {repos.map((r) => (
                <span
                  key={r}
                  className="flex items-center gap-1 rounded-full bg-indigo-50 py-1 pr-1 pl-2.5 text-xs font-medium text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200"
                >
                  {r}
                  <button
                    aria-label={`Quitar ${r}`}
                    className="rounded-full p-0.5 hover:bg-indigo-200/60 dark:hover:bg-indigo-400/20"
                    onClick={() => toggle(r)}
                  >
                    <XIcon width={12} height={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
              Elige al menos uno; mientras tanto se vigilan todos.
            </p>
          )}

          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              className={`${input} pl-9`}
              placeholder="Buscar repo o escribir owner/nombre"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manual) {
                  toggle(filter.trim());
                  setFilter("");
                }
              }}
            />
          </div>

          <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            {!token && <p className="p-4 text-sm text-zinc-500">Conecta tu cuenta para ver tus repos.</p>}
            {token && !options && !loadError && <p className="p-4 text-sm text-zinc-500">Cargando tus repos…</p>}
            {loadError && <p className="p-4 text-sm text-rose-600">{loadError}</p>}
            {manual && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => {
                  toggle(filter.trim());
                  setFilter("");
                }}
              >
                Añadir <strong>{filter.trim()}</strong>
              </button>
            )}
            {options && filtered.length === 0 && !manual && (
              <p className="p-4 text-sm text-zinc-500">Ningún repo coincide.</p>
            )}
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {filtered.map((repo) => {
                const checked = selected.has(repo.name.toLowerCase());
                return (
                  <li key={repo.name}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <Checkbox checked={checked} onChange={() => toggle(repo.name)} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="text-zinc-500">{repo.name.split("/")[0]}/</span>
                        <span className="font-medium">{repo.name.split("/")[1]}</span>
                      </span>
                      {repo.isPrivate && <LockIcon width={12} height={12} className="shrink-0 text-zinc-400" />}
                      <span className="shrink-0 text-xs text-zinc-400">{timeAgo(repo.pushedAt)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Alerts ---------- */

function defaultMode(view: View): Exclude<NotifyMode, "off"> {
  return DEFAULT_VIEWS.find((d) => d.id === view.id)?.notify === "change" || view.changeOn ? "change" : "new";
}

function AlertsCard({ views, onChange }: { views: View[]; onChange: (views: View[]) => void }) {
  const updateView = (index: number, patch: Partial<View>) =>
    onChange(views.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  return (
    <Card title="Avisos" description="Cada bloque es una pestaña del popup.">
      <div className="-mx-5 divide-y divide-zinc-100 dark:divide-zinc-800">
        {views.map((view, i) => (
          <ViewEditor
            key={view.id}
            view={view}
            builtIn={DEFAULT_VIEWS.some((d) => d.id === view.id)}
            onChange={(patch) => updateView(i, patch)}
            onDelete={() => onChange(views.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <Button
          variant="secondary"
          onClick={() =>
            onChange([
              ...views,
              {
                id: crypto.randomUUID(),
                name: "Nueva pestaña",
                description: "",
                query: "is:pr is:open ",
                notify: "new",
                badge: false,
              },
            ])
          }
        >
          + Pestaña personalizada
        </Button>
      </div>
    </Card>
  );
}

function ViewEditor({
  view,
  builtIn,
  onChange,
  onDelete,
}: {
  view: View;
  builtIn: boolean;
  onChange: (patch: Partial<View>) => void;
  onDelete: () => void;
}) {
  const [advanced, setAdvanced] = useState(!builtIn);
  const enabled = view.notify !== "off";
  const mode = enabled ? view.notify : defaultMode(view);
  const triggers = view.changeOn ?? DEFAULT_CHANGE_TRIGGERS;

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {builtIn ? (
            <h3 className="text-sm font-semibold">{view.name}</h3>
          ) : (
            <input
              aria-label="Nombre de la pestaña"
              className="w-full rounded-md bg-transparent text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/30"
              value={view.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          )}
          {view.description && <p className="mt-0.5 text-sm text-zinc-500">{view.description}</p>}
        </div>
        <Switch
          label="Avisarme"
          checked={enabled}
          onChange={(on) => onChange({ notify: on ? defaultMode(view) : "off" })}
        />
      </div>

      {enabled && mode === "change" && (
        <div className="mt-3 space-y-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
          {(Object.keys(TRIGGER_LABELS) as (keyof ChangeTriggers)[]).map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Checkbox
                checked={triggers[key]}
                onChange={(checked) => onChange({ changeOn: { ...triggers, [key]: checked } })}
              />
              {TRIGGER_LABELS[key]}
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox checked={view.badge} onChange={(badge) => onChange({ badge })} />
          Contar en el icono
        </label>
        <button
          className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          onClick={() => setAdvanced((a) => !a)}
        >
          {advanced ? "Ocultar búsqueda" : "Editar búsqueda"}
        </button>
        {!builtIn && (
          <button className="ml-auto text-zinc-400 hover:text-rose-600" aria-label="Borrar pestaña" onClick={onDelete}>
            <TrashIcon />
          </button>
        )}
      </div>

      {advanced && (
        <div className="mt-3 space-y-3">
          <input
            aria-label="Búsqueda de GitHub"
            spellCheck={false}
            className={`${input} font-mono text-xs`}
            value={view.query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
          {!builtIn && (
            <Segmented
              value={mode}
              onChange={(notify) => onChange({ notify, changeOn: notify === "change" ? triggers : undefined })}
              options={[
                { value: "new", label: "Avisar cuando aparece algo nuevo" },
                { value: "change", label: "Avisar cuando cambia" },
              ]}
            />
          )}
          <p className="text-xs text-zinc-500">
            Usa la <Link href={SEARCH_SYNTAX_URL}>sintaxis de búsqueda de GitHub</Link>. Los repos elegidos arriba se
            añaden solos.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Primitives ---------- */

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" className="inline-flex flex-wrap gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-zinc-500">
      {label}
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </button>
    </label>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="relative flex size-4 shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer size-4 cursor-pointer appearance-none rounded border border-zinc-300 bg-white transition checked:border-indigo-600 checked:bg-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:border-zinc-600 dark:bg-zinc-900"
      />
      <CheckIcon
        width={12}
        height={12}
        strokeWidth={3}
        className="pointer-events-none absolute top-0.5 left-0.5 hidden text-white peer-checked:block"
      />
    </span>
  );
}

function Button({
  variant = "primary",
  ...props
}: { variant?: "primary" | "secondary" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-500"
      : "border border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800";
  return (
    <button
      {...props}
      className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
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
