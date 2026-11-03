import { fetchViews, GitHubError } from "../lib/github";
import { ciMessage, MENTION_PLACES, REVIEW_VERBS } from "../lib/status";
import {
  DEFAULT_CHANGE_TRIGGERS,
  effectiveQuery,
  load,
  parseSignature,
  save,
  signature,
  visibleItems,
} from "../lib/storage";
import type { Item, Seen, Snapshot, View } from "../lib/types";

const ALARM = "poll";
// Beyond this many new items in a single view we send one summary notification.
const MAX_INDIVIDUAL = 3;

let inFlight: Promise<void> | null = null;

function poll(): Promise<void> {
  inFlight ??= runPoll().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runPoll(): Promise<void> {
  const settings = await load("settings");
  const previous = await load("snapshot");

  if (!settings.token) {
    await save("snapshot", { fetchedAt: Date.now(), login: "", results: {}, error: "no-token" });
    await updateBadge();
    return;
  }

  let snapshot: Snapshot;
  try {
    const { login, results } = await fetchViews(settings.token, settings.views, settings.repos);
    snapshot = { fetchedAt: Date.now(), login, results };
  } catch (err) {
    const message = err instanceof GitHubError || err instanceof Error ? err.message : String(err);
    // Keep the last good results visible; only flag the error.
    await save("snapshot", {
      fetchedAt: previous?.fetchedAt ?? Date.now(),
      login: previous?.login ?? "",
      results: previous?.results ?? {},
      error: message,
    });
    await updateBadge();
    return;
  }

  const seen = await load("seen");
  const nextSeen: Seen = {};
  for (const view of settings.views) {
    const items = snapshot.results[view.id]?.items ?? [];
    const key = effectiveQuery(view.query, settings.repos);
    const before = seen[key];
    nextSeen[key] = Object.fromEntries(items.map((item) => [item.id, signature(item)]));
    // First time we see this query: seed silently instead of flooding notifications.
    if (before) notifyView(view, items, before);
  }

  // Drop dismissals for items no longer in any view, so a re-request shows up again.
  const dismissed = await load("dismissed");
  const live = new Set(Object.values(snapshot.results).flatMap((r) => r.items.map((i) => i.id)));
  const prunedDismissed = Object.fromEntries(Object.entries(dismissed).filter(([id]) => live.has(id)));

  await chrome.storage.local.set({ snapshot, seen: nextSeen, dismissed: prunedDismissed });
  await updateBadge();
}

interface Alert {
  id: string;
  title: string;
  message: string;
  contextMessage?: string;
}

function ref(item: Item): string {
  return `${item.repo}#${item.number}`;
}

/** What, if anything, is worth telling the user about this item since the last poll. */
function alertFor(view: View, item: Item, beforeSig: string | undefined): Alert | null {
  const isNew = beforeSig === undefined;
  const prev = parseSignature(beforeSig);
  const mentionChanged = item.mention && prev && prev.mention !== item.mention.url;

  if (item.mention && (isNew || mentionChanged)) {
    return {
      id: item.mention.url,
      title: `@${item.mention.author} te ha mencionado ${MENTION_PLACES[item.mention.place]}`,
      message: item.mention.excerpt,
      contextMessage: `${ref(item)} · ${item.title}`,
    };
  }

  if (view.notify === "new") {
    if (!isNew) return null;
    // Mention view item where the mention isn't explicit (usually a team mention).
    if (item.mention === null) {
      return { id: item.url, title: "Te han mencionado", message: item.title, contextMessage: ref(item) };
    }
    if (item.myReviewAt) {
      return { id: item.url, title: "🔁 Te vuelven a pedir review", message: item.title, contextMessage: ref(item) };
    }
    return { id: item.url, title: `👀 ${item.author} te pide review`, message: item.title, contextMessage: ref(item) };
  }

  // "change" mode: only items we already knew, with a readable previous signature.
  if (!prev) return null;
  const on = view.changeOn ?? DEFAULT_CHANGE_TRIGGERS;

  if (on.reviews && item.lastReview && prev.review !== item.lastReview.id) {
    return {
      id: item.lastReview.url,
      title: `${item.lastReview.author} ${REVIEW_VERBS[item.lastReview.state]} tu PR`,
      message: item.title,
      contextMessage: ref(item),
    };
  }
  if (on.ci && prev.ci !== item.ci) {
    const message = ciMessage(item);
    if (message) return { id: item.url, title: message, message: item.title, contextMessage: ref(item) };
  }
  if (on.commits && prev.sha && item.headSha && prev.sha !== item.headSha) {
    return {
      id: item.url,
      title: "📝 Han subido cambios a una PR que revisaste",
      message: item.title,
      contextMessage: ref(item),
    };
  }
  return null;
}

function notifyView(view: View, items: Item[], before: Record<string, string>): void {
  if (view.notify === "off") return;

  const alerts = items.map((item) => alertFor(view, item, before[item.id])).filter((a) => a !== null);
  if (alerts.length === 0) return;

  if (alerts.length > MAX_INDIVIDUAL) {
    notify({
      id: `summary:${view.id}`,
      title: `${view.name}: ${alerts.length} novedades`,
      message: alerts
        .slice(0, 4)
        .map((a) => `• ${a.title}`)
        .join("\n"),
    });
    return;
  }

  for (const alert of alerts) notify(alert);
}

function notify({ id, ...opts }: Alert): void {
  void chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    priority: 2,
    ...opts,
  });
}

async function updateBadge(): Promise<void> {
  const [settings, snapshot, dismissed] = await Promise.all([
    load("settings"),
    load("snapshot"),
    load("dismissed"),
  ]);

  if (snapshot?.error) {
    await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    await chrome.action.setBadgeText({ text: "!" });
    return;
  }

  const count = settings.views
    .filter((view) => view.badge)
    .reduce((sum, view) => sum + visibleItems(snapshot?.results[view.id]?.items ?? [], dismissed).length, 0);
  await chrome.action.setBadgeBackgroundColor({ color: "#e11d48" });
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
}

async function schedule(): Promise<void> {
  const { pollMinutes } = await load("settings");
  await chrome.alarms.create(ALARM, { periodInMinutes: Math.max(0.5, pollMinutes) });
}

chrome.runtime.onInstalled.addListener((details) => {
  void schedule().then(poll);
  if (details.reason === "install") void chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  void schedule().then(poll);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void poll();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings) void schedule().then(poll);
  else if (changes.dismissed) void updateBadge();
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("summary:")) void chrome.action.openPopup().catch(() => undefined);
  else void chrome.tabs.create({ url: id });
  void chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message.type !== "poll") return false;
  void poll().then(() => sendResponse({ ok: true }));
  return true; // keep the channel open for the async response
});
