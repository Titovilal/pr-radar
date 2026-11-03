import { findMention, type MentionCandidate } from "./mentions";
import { effectiveQuery } from "./storage";
import type { CiState, Item, Review, ReviewDecision, ReviewState, View, ViewResult } from "./types";

const ENDPOINT = "https://api.github.com/graphql";

const AUTHOR = "author { login avatarUrl }";
const BASE = `id number title url updatedAt createdAt body repository { nameWithOwner } ${AUTHOR}`;
const PR = `isDraft reviewDecision headRefName baseRefName
  commits(last: 1) { nodes { commit { oid committedDate statusCheckRollup { state } } } }
  recentReviews: reviews(last: 20) { nodes { id state url submittedAt ${AUTHOR} } }`;
const COMMENT = `body url createdAt ${AUTHOR}`;
const COMMENTS = `comments(last: 30) { nodes { ${COMMENT} } }`;
const REVIEW_BODIES = `mentionReviews: reviews(last: 10) { nodes { ${COMMENT} comments(last: 10) { nodes { ${COMMENT} path } } } }`;

function fields(withMentions: boolean): string {
  return `nodes {
    __typename
    ... on PullRequest { ${BASE} ${PR} ${withMentions ? `${COMMENTS} ${REVIEW_BODIES}` : ""} }
    ... on Issue { ${BASE} ${withMentions ? COMMENTS : ""} }
  }`;
}

export function isMentionView(view: View): boolean {
  return /\bmentions:/i.test(view.query);
}

export class GitHubError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

interface RawAuthor {
  login: string;
  avatarUrl: string;
}

interface RawComment {
  body: string;
  url: string;
  createdAt: string;
  author: RawAuthor | null;
  path?: string;
}

interface RawReview {
  id: string;
  state: ReviewState;
  url: string;
  submittedAt: string | null;
  author: RawAuthor | null;
}

interface RawNode {
  __typename: string;
  id: string;
  number: number;
  title: string;
  url: string;
  updatedAt: string;
  createdAt: string;
  body: string;
  isDraft?: boolean;
  reviewDecision?: ReviewDecision;
  headRefName?: string;
  baseRefName?: string;
  repository: { nameWithOwner: string };
  author: RawAuthor | null;
  commits?: {
    nodes: { commit: { oid: string; committedDate: string; statusCheckRollup: { state: CiState } | null } }[];
  };
  recentReviews?: { nodes: RawReview[] };
  comments?: { nodes: RawComment[] };
  mentionReviews?: { nodes: (RawComment & { comments: { nodes: RawComment[] } })[] };
}

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: { message: string; path?: string[] }[];
  message?: string;
}

function mentionCandidates(node: RawNode): MentionCandidate[] {
  const out: MentionCandidate[] = [{ ...node, place: "description" }];
  for (const c of node.comments?.nodes ?? []) out.push({ ...c, place: "comment" });
  for (const review of node.mentionReviews?.nodes ?? []) {
    out.push({ ...review, place: "review" });
    for (const c of review.comments.nodes) out.push({ ...c, place: "code" });
  }
  return out;
}

function reviewInfo(node: RawNode, login: string): Pick<Item, "lastReview" | "myReviewAt"> {
  const reviews = (node.recentReviews?.nodes ?? []).filter((r) => r.submittedAt && r.state !== "PENDING");
  const me = login.toLowerCase();
  const mine = reviews.filter((r) => r.author?.login.toLowerCase() === me);
  // Self-reviews on your own PR (replies to threads) aren't "someone reviewed my PR".
  const others = reviews.filter((r) => r.author && r.author.login.toLowerCase() !== me);
  const last = others.at(-1);
  const lastReview: Review | null = last
    ? {
        id: last.id,
        author: last.author!.login,
        authorAvatar: last.author!.avatarUrl,
        state: last.state,
        submittedAt: last.submittedAt!,
        url: last.url,
      }
    : null;
  return { lastReview, myReviewAt: mine.at(-1)?.submittedAt ?? null };
}

function toItem(node: RawNode, login: string, withMentions: boolean): Item {
  const isPr = node.__typename === "PullRequest";
  const head = node.commits?.nodes[0]?.commit;
  return {
    id: node.id,
    kind: isPr ? "pr" : "issue",
    number: node.number,
    title: node.title,
    url: node.url,
    repo: node.repository.nameWithOwner,
    author: node.author?.login ?? "ghost",
    authorAvatar: node.author?.avatarUrl ?? "",
    updatedAt: node.updatedAt,
    isDraft: node.isDraft ?? false,
    reviewDecision: node.reviewDecision ?? null,
    ci: head?.statusCheckRollup?.state ?? null,
    headRef: node.headRefName,
    baseRef: node.baseRefName,
    headSha: head?.oid,
    headCommittedAt: head?.committedDate,
    ...(isPr ? reviewInfo(node, login) : {}),
    mention: withMentions ? findMention(mentionCandidates(node), login) : undefined,
  };
}

async function graphql(token: string, query: string, variables: Record<string, unknown>): Promise<GraphQLResponse> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as GraphQLResponse;
  if (!res.ok) {
    const message =
      res.status === 401 ? "Token inválido o caducado" : (body.message ?? `GitHub respondió ${res.status}`);
    throw new GitHubError(message, res.status);
  }
  if (!body.data) throw new GitHubError(body.errors?.[0]?.message ?? "Respuesta vacía de GitHub");
  return body;
}

/** Runs every view's search in a single GraphQL request (one alias per view). */
export async function fetchViews(
  token: string,
  views: View[],
  repos: string[] = [],
): Promise<{ login: string; results: Record<string, ViewResult> }> {
  const variables: Record<string, string> = {};
  const params: string[] = [];
  const selections = views.map((view, i) => {
    const query = effectiveQuery(view.query, repos);
    // When the repo qualifiers don't fit in the query we filter afterwards, so ask for more.
    const first = repos.length && query === view.query ? 100 : 50;
    variables[`q${i}`] = query;
    params.push(`$q${i}: String!`);
    return `v${i}: search(query: $q${i}, type: ISSUE, first: ${first}) { ${fields(isMentionView(view))} }`;
  });
  const query = params.length
    ? `query(${params.join(", ")}) { viewer { login } ${selections.join("\n")} }`
    : "query { viewer { login } }";
  const body = await graphql(token, query, variables);

  const errorsByAlias = new Map<string, string>();
  for (const err of body.errors ?? []) {
    if (err.path?.[0]) errorsByAlias.set(err.path[0], err.message);
  }

  const login = (body.data?.viewer as { login: string } | null)?.login ?? "";
  const allowed = new Set(repos.map((r) => r.toLowerCase()));
  const results: Record<string, ViewResult> = {};
  views.forEach((view, i) => {
    const alias = `v${i}`;
    const search = body.data?.[alias] as { nodes: RawNode[] } | null | undefined;
    const items = (search?.nodes ?? [])
      // Search nodes can be empty objects for types outside the fragments (e.g. discussions).
      .filter((n) => n?.id)
      .filter((n) => allowed.size === 0 || allowed.has(n.repository.nameWithOwner.toLowerCase()))
      .map((n) => toItem(n, login, isMentionView(view)));
    results[view.id] = { items, error: errorsByAlias.get(alias) };
  });

  return { login, results };
}

export interface RepoOption {
  name: string;
  pushedAt: string;
  isPrivate: boolean;
}

interface RawRepo {
  nameWithOwner: string;
  pushedAt: string;
  isPrivate: boolean;
  isArchived: boolean;
}

const REPO = "nameWithOwner pushedAt isPrivate isArchived";
const REPO_ORDER = "orderBy: { field: PUSHED_AT, direction: DESC }";

function mergeRepos(raw: (RawRepo | null | undefined)[]): RepoOption[] {
  const byName = new Map<string, RepoOption>();
  for (const r of raw) {
    if (!r || r.isArchived || byName.has(r.nameWithOwner.toLowerCase())) continue;
    byName.set(r.nameWithOwner.toLowerCase(), { name: r.nameWithOwner, pushedAt: r.pushedAt, isPrivate: r.isPrivate });
  }
  return [...byName.values()].sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

/**
 * Repos the token can see, most recently pushed first. `viewer.repositories` alone skips repos
 * reached through org teams, so we also merge each org's repos and the ones the viewer contributed to.
 */
export async function fetchRepos(token: string): Promise<RepoOption[]> {
  const query = `query {
    viewer {
      repositories(first: 100, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], ${REPO_ORDER}) {
        nodes { ${REPO} }
      }
      repositoriesContributedTo(first: 100, includeUserRepositories: true, ${REPO_ORDER}) { nodes { ${REPO} } }
      organizations(first: 20) {
        nodes { repositories(first: 100, ${REPO_ORDER}) { nodes { ${REPO} } } }
      }
    }
  }`;
  type Conn = { nodes: (RawRepo | null)[] } | null;
  const body = await graphql(token, query, {});
  const viewer = body.data?.viewer as {
    repositories: Conn;
    repositoriesContributedTo: Conn;
    // An org can come back null when it restricts third-party access for this token.
    organizations: { nodes: ({ repositories: Conn } | null)[] } | null;
  };
  return mergeRepos([
    ...(viewer.repositories?.nodes ?? []),
    ...(viewer.repositoriesContributedTo?.nodes ?? []),
    ...(viewer.organizations?.nodes ?? []).flatMap((org) => org?.repositories?.nodes ?? []),
  ]);
}

/** Live repo search by name, for repos missing from `fetchRepos`. */
export async function searchRepos(token: string, text: string): Promise<RepoOption[]> {
  const query = `query($q: String!) { search(query: $q, type: REPOSITORY, first: 20) { nodes { ... on Repository { ${REPO} } } } }`;
  const body = await graphql(token, query, { q: `${text} in:name archived:false` });
  return mergeRepos((body.data?.search as { nodes: RawRepo[] } | null)?.nodes ?? []);
}
