import type { Dismissed, Item, Seen, Settings, Snapshot, View } from "./types";

export const DEFAULT_VIEWS: View[] = [
  {
    id: "review",
    name: "Reviews",
    query: "is:pr is:open review-requested:@me archived:false sort:updated-desc",
    notify: "new",
    badge: true,
  },
  {
    id: "mine",
    name: "Mis PRs",
    query: "is:pr is:open author:@me archived:false sort:updated-desc",
    notify: "change",
    badge: false,
  },
  {
    id: "mentions",
    name: "Menciones",
    query: "is:open mentions:@me archived:false sort:updated-desc",
    notify: "new",
    badge: false,
  },
];

export const DEFAULT_SETTINGS: Settings = { token: "", pollMinutes: 2, views: DEFAULT_VIEWS };

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
  if (key === "settings") return { ...DEFAULT_SETTINGS, ...(value as Settings) } as StorageShape[K];
  return value ?? FALLBACKS[key];
}

export function save<K extends StorageKey>(key: K, value: StorageShape[K]): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

export function signature(item: Item): string {
  return `${item.reviewDecision}|${item.ci}|${item.isDraft}`;
}

export function visibleItems(items: Item[], dismissed: Dismissed): Item[] {
  return items.filter((item) => dismissed[item.id] !== signature(item));
}
