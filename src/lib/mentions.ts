import type { Mention, MentionPlace } from "./types";

export interface MentionCandidate {
  body: string;
  url: string;
  createdAt: string;
  author: { login: string; avatarUrl: string } | null;
  place: MentionPlace;
  path?: string;
}

const BEFORE = 70;
const AFTER = 170;

/** Markdown to plain text, dropping quoted replies and code so we don't match a mention that's only being quoted. */
export function cleanBody(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_~`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mentionPattern(login: string): RegExp {
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}(?![\\w-])`, "i");
}

export function excerpt(text: string, index: number): string {
  let start = Math.max(0, index - BEFORE);
  let end = Math.min(text.length, index + AFTER);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > index ? text.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** Latest place where `login` is @-mentioned, or null if it isn't explicit (e.g. a team mention). */
export function findMention(candidates: MentionCandidate[], login: string): Mention | null {
  const pattern = mentionPattern(login);
  const sorted = [...candidates].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const c of sorted) {
    const text = cleanBody(c.body ?? "");
    const match = pattern.exec(text);
    if (!match) continue;
    return {
      author: c.author?.login ?? "ghost",
      authorAvatar: c.author?.avatarUrl ?? "",
      excerpt: excerpt(text, match.index),
      url: c.url,
      createdAt: c.createdAt,
      place: c.place,
      path: c.path,
    };
  }
  return null;
}
