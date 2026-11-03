import type { Item, MentionPlace, ReviewState } from "./types";

export type Tone = "green" | "red" | "amber" | "gray" | "blue";

export interface Chip {
  label: string;
  tone: Tone;
}

/** New commits landed after the viewer's last review. */
export function hasChangesSinceMyReview(item: Item): boolean {
  return Boolean(item.myReviewAt && item.headCommittedAt && item.headCommittedAt > item.myReviewAt);
}

export function chips(item: Item, viewId: string): Chip[] {
  if (item.kind === "issue") return [];
  const out: Chip[] = [];
  if (viewId === "review" && item.myReviewAt) out.push({ label: "Te la vuelven a pedir", tone: "blue" });
  if (hasChangesSinceMyReview(item) && viewId !== "mine")
    out.push({ label: "Cambios desde tu review", tone: "blue" });
  if (item.isDraft) out.push({ label: "Draft", tone: "gray" });
  if (item.reviewDecision === "APPROVED") out.push({ label: "Aprobada", tone: "green" });
  if (item.reviewDecision === "CHANGES_REQUESTED") out.push({ label: "Cambios pedidos", tone: "amber" });
  if (item.ci === "SUCCESS") out.push({ label: "CI ✓", tone: "green" });
  if (item.ci === "FAILURE" || item.ci === "ERROR") out.push({ label: "CI ✗", tone: "red" });
  if (item.ci === "PENDING" || item.ci === "EXPECTED") out.push({ label: "CI …", tone: "gray" });
  return out;
}

export const REVIEW_VERBS: Record<ReviewState, string> = {
  APPROVED: "ha aprobado",
  CHANGES_REQUESTED: "ha pedido cambios en",
  COMMENTED: "ha comentado",
  DISMISSED: "ha descartado su review de",
  PENDING: "está revisando",
};

export const REVIEW_TONES: Record<ReviewState, Tone> = {
  APPROVED: "green",
  CHANGES_REQUESTED: "amber",
  COMMENTED: "gray",
  DISMISSED: "gray",
  PENDING: "gray",
};

export const MENTION_PLACES: Record<MentionPlace, string> = {
  description: "en la descripción",
  comment: "en un comentario",
  review: "en una review",
  code: "en un comentario de código",
};

export function ciMessage(item: Item): string | null {
  if (item.ci === "FAILURE" || item.ci === "ERROR") return "❌ El CI ha fallado";
  if (item.ci === "SUCCESS") return item.reviewDecision === "APPROVED" ? "🚀 Aprobada y en verde" : "🟢 CI en verde";
  return null;
}

export function timeAgo(iso: string | number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "ahora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d`;
  return `${Math.round(days / 30)} mes`;
}
