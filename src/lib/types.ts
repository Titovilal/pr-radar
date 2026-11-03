export type NotifyMode = "new" | "change" | "off";

/** What counts as a "change" for views in `change` mode. */
export interface ChangeTriggers {
  /** Someone else submits a review. */
  reviews: boolean;
  /** CI turns green or red. */
  ci: boolean;
  /** New commits are pushed. */
  commits: boolean;
}

export interface View {
  id: string;
  name: string;
  description?: string;
  query: string;
  /** "new": notify when an item appears; "change": when it changes (see `changeOn`). */
  notify: NotifyMode;
  changeOn?: ChangeTriggers;
  badge: boolean;
}

export interface Settings {
  version: number;
  token: string;
  pollMinutes: number;
  /** "owner/name" list; empty means every repo the token can see. */
  repos: string[];
  views: View[];
}

export type CiState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | null;
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";

export type MentionPlace = "description" | "comment" | "review" | "code";

export interface Mention {
  author: string;
  authorAvatar: string;
  /** Plain-text snippet around the @mention. */
  excerpt: string;
  url: string;
  createdAt: string;
  place: MentionPlace;
  /** File path, for inline review comments. */
  path?: string;
}

export interface Review {
  id: string;
  author: string;
  authorAvatar: string;
  state: ReviewState;
  submittedAt: string;
  url: string;
}

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
  headRef?: string;
  baseRef?: string;
  headSha?: string;
  headCommittedAt?: string;
  /** Latest review submitted by someone other than the viewer. */
  lastReview?: Review | null;
  /** When the viewer last reviewed this PR, if ever. */
  myReviewAt?: string | null;
  /** Only filled for views whose query uses `mentions:`. Null when the mention can't be located (e.g. team mention). */
  mention?: Mention | null;
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

/** Last known signature per item, keyed by effective query so editing a query reseeds silently. */
export type Seen = Record<string, Record<string, string>>;

/** Item id -> signature at the moment it was dismissed. */
export type Dismissed = Record<string, string>;
