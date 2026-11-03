export type NotifyMode = "new" | "change" | "off";

export interface View {
  id: string;
  name: string;
  query: string;
  /** "new": notify when an item appears; "change": when its review/CI state changes. */
  notify: NotifyMode;
  badge: boolean;
}

export interface Settings {
  token: string;
  pollMinutes: number;
  views: View[];
}

export type CiState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | null;
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface Item {
  id: string;
  kind: "pr" | "issue";
  number: number;
  title: string;
  url: string;
  repo: string;
  author: string;
  authorAvatar: string;
  updatedAt: string;
  isDraft: boolean;
  reviewDecision: ReviewDecision;
  ci: CiState;
}

export interface ViewResult {
  items: Item[];
  error?: string;
}

export interface Snapshot {
  fetchedAt: number;
  login: string;
  /** Keyed by view id. */
  results: Record<string, ViewResult>;
  error?: string;
}

/** Last known signature per item, keyed by view query so editing a query reseeds silently. */
export type Seen = Record<string, Record<string, string>>;

/** Item id -> signature at the moment it was dismissed. */
export type Dismissed = Record<string, string>;
