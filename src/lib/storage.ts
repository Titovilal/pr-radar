import type { Dismissed, Item, Seen, Settings, Snapshot, View } from "./types";

const MINE_TRIGGERS = { reviews: true, ci: true, commits: false };

export const DEFAULT_VIEWS: View[] = [
  {
    id: "review",
    name: "Para revisar",
    description: "PRs donde te piden review, también cuando te la vuelven a pedir.",
    query: "is:pr is:open review-requested:@me archived:false sort:updated-desc",
    notify: "new",
    badge: true,
  },
  {
    id: "mine",
    name: "Mis PRs",
    description: "Tus PRs abiertas. Avisa cuando alguien las revisa o cambia el CI.",
    query: "is:pr is:open author:@me archived:false sort:updated-desc",
    notify: "change",
    changeOn: MINE_TRIGGERS,
    badge: false,
  },
  {
    id: "reviewed",
    name: "Revisadas",
    description: "PRs abiertas que ya revisaste. Avisa cuando suben cambios nuevos.",
    query: "is:pr is:open reviewed-by:@me -author:@me archived:false sort:updated-desc",
    notify: "change",
    changeOn: { reviews: false, ci: false, commits: true },
    badge: false,
  },
  {
    id: "mentions",
    name: "Menciones",
    description: "Issues y PRs abiertas donde te mencionan, con el comentario exacto.",
    query: "is:open mentions:@me archived:false sort:updated-desc",
    notify: "new",
    badge: false,
  },
];

export const DEFAULT_CHANGE_TRIGGERS = MINE_TRIGGERS;

// Bump when DEFAULT_VIEWS changes in a way existing installs should pick up.
const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  token: "",
  pollMinutes: 2,
  repos: [],
  views: DEFAULT_VIEWS,
};

interface StorageShape {
  settings: Settings;
  snapshot: Snapshot | null;
  seen: Seen;
  dismissed: Dismissed;
}

const FALLBACKS: StorageShape = {
  settings: DEFAULT_SETTINGS,
  snapshot: null,
  seen: {},
  dismissed: {},
};

export type StorageKey = keyof StorageShape;
export type StorageValue<K extends StorageKey> = StorageShape[K];

export async function load<K extends StorageKey>(key: K): Promise<StorageShape[K]> {
  const data = await chrome.storage.local.get(key);
  const value = data[key] as StorageShape[K] | undefined;
  if (key === "settings") {
    const stored = value as Partial<Settings> | undefined;
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    if ((stored?.version ?? 1) < SETTINGS_VERSION) {
      merged.views = DEFAULT_VIEWS;
      merged.version = SETTINGS_VERSION;
    }
    return merged as StorageShape[K];
  }
  return value ?? FALLBACKS[key];
}

export function save<K extends StorageKey>(key: K, value: StorageShape[K]): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

export interface SignatureParts {
  decision: string | null;
  ci: string | null;
  draft: boolean;
  mention: string | null;
  review: string | null;
  sha: string | null;
}

/** Everything whose change can trigger a notification or bring back a dismissed item. */
export function signature(item: Item): string {
  const parts: SignatureParts = {
    decision: item.reviewDecision,
    ci: item.ci,
    draft: item.isDraft,
    mention: item.mention?.url ?? null,
    review: item.lastReview?.id ?? null,
    sha: item.headSha ?? null,
  };
  return JSON.stringify(parts);
}

/** Null for signatures written by older versions, which we treat as "unknown, don't notify". */
export function parseSignature(sig: string | undefined): SignatureParts | null {
  if (!sig?.startsWith("{")) return null;
  try {
    return JSON.parse(sig) as SignatureParts;
  } catch {
    return null;
  }
}

// GitHub rejects search queries longer than this.
const MAX_QUERY_LENGTH = 256;

/** The view query restricted to the chosen repos, when the qualifiers fit in GitHub's query limit. */
export function effectiveQuery(query: string, repos: string[]): string {
  if (repos.length === 0) return query;
  const scoped = `${query} ${repos.map((r) => `repo:${r}`).join(" ")}`;
  return scoped.length <= MAX_QUERY_LENGTH ? scoped : query;
}

/** Items from the chosen repos (if any) that aren't dismissed; also guards against snapshots taken before the repo selection changed. */
export function visibleItems(items: Item[], dismissed: Dismissed, repos: string[] = []): Item[] {
  return inRepos(items, repos).filter((item) => dismissed[item.id] !== signature(item));
}

export function inRepos(items: Item[], repos: string[]): Item[] {
  if (repos.length === 0) return items;
  const allowed = new Set(repos.map((r) => r.toLowerCase()));
  return items.filter((item) => allowed.has(item.repo.toLowerCase()));
}
