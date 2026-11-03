import type { Item } from "./types";

export type Tone = "green" | "red" | "amber" | "gray" | "blue";

export interface Chip {
  label: string;
  tone: Tone;
}

export function chips(item: Item): Chip[] {
  if (item.kind === "issue") return [{ label: "Issue", tone: "gray" }];
  const out: Chip[] = [];
  if (item.isDraft) out.push({ label: "Draft", tone: "gray" });
  if (item.reviewDecision === "APPROVED") out.push({ label: "Aprobada", tone: "green" });
  if (item.reviewDecision === "CHANGES_REQUESTED") out.push({ label: "Cambios pedidos", tone: "amber" });
  if (item.reviewDecision === "REVIEW_REQUIRED") out.push({ label: "Sin review", tone: "blue" });
  if (item.ci === "SUCCESS") out.push({ label: "CI ✓", tone: "green" });
  if (item.ci === "FAILURE" || item.ci === "ERROR") out.push({ label: "CI ✗", tone: "red" });
  if (item.ci === "PENDING" || item.ci === "EXPECTED") out.push({ label: "CI …", tone: "gray" });
  return out;
}

/** One-line summary of the state, used in change notifications. */
export function describe(item: Item): string {
  if (item.ci === "FAILURE" || item.ci === "ERROR") return "❌ El CI ha fallado";
  if (item.reviewDecision === "CHANGES_REQUESTED") return "✋ Te han pedido cambios";
  if (item.reviewDecision === "APPROVED" && item.ci === "SUCCESS") return "🚀 Aprobada y en verde";
  if (item.reviewDecision === "APPROVED") return "✅ Aprobada";
  if (item.ci === "SUCCESS") return "🟢 CI en verde";
  return "Ha cambiado de estado";
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
