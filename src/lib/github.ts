import type { CiState, Item, ReviewDecision, View, ViewResult } from "./types";

const ENDPOINT = "https://api.github.com/graphql";

const FIELDS = `
  nodes {
    __typename
    ... on PullRequest {
      id number title url updatedAt isDraft reviewDecision
      repository { nameWithOwner }
      author { login avatarUrl }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
    ... on Issue {
      id number title url updatedAt
      repository { nameWithOwner }
      author { login avatarUrl }
    }
  }`;

export class GitHubError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

interface RawNode {
  __typename: string;
  id: string;
  number: number;
  title: string;
  url: string;
  updatedAt: string;
  isDraft?: boolean;
  reviewDecision?: ReviewDecision;
  repository: { nameWithOwner: string };
  author: { login: string; avatarUrl: string } | null;
  commits?: { nodes: { commit: { statusCheckRollup: { state: CiState } | null } }[] };
}

interface GraphQLResponse {
  data?: Record<string, { nodes: RawNode[] } | { login: string } | null>;
  errors?: { message: string; path?: string[] }[];
  message?: string;
}

function toItem(node: RawNode): Item {
  return {
    id: node.id,
    kind: node.__typename === "PullRequest" ? "pr" : "issue",
    number: node.number,
    title: node.title,
    url: node.url,
    repo: node.repository.nameWithOwner,
    author: node.author?.login ?? "ghost",
    authorAvatar: node.author?.avatarUrl ?? "",
    updatedAt: node.updatedAt,
    isDraft: node.isDraft ?? false,
    reviewDecision: node.reviewDecision ?? null,
    ci: node.commits?.nodes[0]?.commit.statusCheckRollup?.state ?? null,
  };
}

/** Runs every view's search in a single GraphQL request (one alias per view). */
export async function fetchViews(
  token: string,
  views: View[],
): Promise<{ login: string; results: Record<string, ViewResult> }> {
  const variables: Record<string, string> = {};
  const params: string[] = [];
  const selections = views.map((view, i) => {
    variables[`q${i}`] = view.query;
    params.push(`$q${i}: String!`);
    return `v${i}: search(query: $q${i}, type: ISSUE, first: 50) { ${FIELDS} }`;
  });
  const query = `query(${params.join(", ")}) { viewer { login } ${selections.join("\n")} }`;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: params.length ? query : "query { viewer { login } }", variables }),
  });
  const body = (await res.json().catch(() => ({}))) as GraphQLResponse;

  if (!res.ok) {
    const message =
      res.status === 401 ? "Token inválido o caducado" : (body.message ?? `GitHub respondió ${res.status}`);
    throw new GitHubError(message, res.status);
  }
  if (!body.data) throw new GitHubError(body.errors?.[0]?.message ?? "Respuesta vacía de GitHub");

  const errorsByAlias = new Map<string, string>();
  for (const err of body.errors ?? []) {
    if (err.path?.[0]) errorsByAlias.set(err.path[0], err.message);
  }

  const results: Record<string, ViewResult> = {};
  views.forEach((view, i) => {
    const alias = `v${i}`;
    const search = body.data?.[alias] as { nodes: RawNode[] } | null | undefined;
    results[view.id] = {
      // Search nodes can be empty objects for types outside the fragments (e.g. discussions).
      items: (search?.nodes ?? []).filter((n) => n?.id).map(toItem),
      error: errorsByAlias.get(alias),
    };
  });

  const viewer = body.data.viewer as { login: string } | null;
  return { login: viewer?.login ?? "", results };
}
