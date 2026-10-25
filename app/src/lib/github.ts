import type { EntryType, Source } from './memory';
import { redact } from './redact';
import { keywords } from './text';

export interface GitHubConfig {
  repo: string;
  token?: string;
}

export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  stars: number;
  openIssuesCount: number;
  topics: string[];
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  htmlUrl: string;
  labels: string[];
  isPullRequest: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

export interface GitHubTestResult {
  ok: boolean;
  status: 'connected' | 'rejected' | 'rate_limited' | 'not_found' | 'error';
  message: string;
  rateLimit?: GitHubRateLimit;
  repoInfo?: GitHubRepoInfo;
}

export interface GitHubImportOptions {
  includeReadme?: boolean;
  includeIssues?: boolean;
  includeCommits?: boolean;
  maxIssues?: number;
  maxCommits?: number;
  issueState?: 'open' | 'closed' | 'all';
}

export interface GitHubRawMemoryItem {
  title: string;
  note: string;
  type: EntryType;
  project: string;
  kws?: string[];
  sources: Source[];
}

/** Parse various forms of GitHub repository input into owner and repo names. */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Handle URL forms: https://github.com/owner/repo or git@github.com:owner/repo.git
  let pathPart = raw;
  const httpMatch = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(raw);
  const sshMatch = /^git@github\.com:([^/\s]+)\/([^/\s#?]+)/i.exec(raw);

  if (httpMatch) {
    pathPart = `${httpMatch[1]}/${httpMatch[2]}`;
  } else if (sshMatch) {
    pathPart = `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Remove .git suffix if present
  pathPart = pathPart.replace(/\.git$/i, '');

  const parts = pathPart
    .split('/')
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];

  // Validate GitHub owner and repo name constraints
  if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
    return null;
  }

  return { owner, repo };
}

function getHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token?.trim()) {
    h.Authorization = `Bearer ${token.trim()}`;
  }
  return h;
}

function parseRateLimit(res: Response): GitHubRateLimit | undefined {
  const limitStr = res.headers.get('x-ratelimit-limit');
  const remainingStr = res.headers.get('x-ratelimit-remaining');
  const resetStr = res.headers.get('x-ratelimit-reset');
  if (limitStr && remainingStr) {
    const limit = parseInt(limitStr, 10);
    const remaining = parseInt(remainingStr, 10);
    const reset = resetStr ? parseInt(resetStr, 10) * 1000 : Date.now() + 3600000;
    if (Number.isFinite(limit) && Number.isFinite(remaining)) {
      return { limit, remaining, reset };
    }
  }
  return undefined;
}

/** Test connectivity to GitHub and a specific repository. */
export async function testGitHubConnection(
  repoInput: string,
  token?: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<GitHubTestResult> {
  const parsed = parseRepoInput(repoInput);
  if (!parsed) {
    return {
      ok: false,
      status: 'error',
      message: 'Invalid repository format. Use "owner/repo" (e.g. Roooted1776/Brain).',
    };
  }

  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  try {
    const res = await fetchImpl(url, { headers: getHeaders(token) });
    const rateLimit = parseRateLimit(res);

    if (res.status === 200) {
      const data = (await res.json()) as Record<string, unknown>;
      const repoInfo: GitHubRepoInfo = {
        name: typeof data.name === 'string' ? data.name : parsed.repo,
        fullName: typeof data.full_name === 'string' ? data.full_name : `${parsed.owner}/${parsed.repo}`,
        description: typeof data.description === 'string' ? data.description : '',
        private: !!data.private,
        htmlUrl:
          typeof data.html_url === 'string' ? data.html_url : `https://github.com/${parsed.owner}/${parsed.repo}`,
        defaultBranch: typeof data.default_branch === 'string' ? data.default_branch : 'main',
        stars: Number(data.stargazers_count) || 0,
        openIssuesCount: Number(data.open_issues_count) || 0,
        topics: Array.isArray(data.topics) ? data.topics.map(String) : [],
      };

      const limitNote = rateLimit ? ` · Rate limit: ${rateLimit.remaining}/${rateLimit.limit}` : '';
      return {
        ok: true,
        status: 'connected',
        message: `Connected: ${repoInfo.fullName} (${repoInfo.stars}★, branch: ${repoInfo.defaultBranch})${limitNote}`,
        rateLimit,
        repoInfo,
      };
    }

    if (res.status === 401) {
      return {
        ok: false,
        status: 'rejected',
        message: 'GitHub token rejected (HTTP 401 Unauthorized). Verify your Personal Access Token.',
        rateLimit,
      };
    }

    if (res.status === 403) {
      const resetTime = rateLimit?.reset
        ? new Date(rateLimit.reset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'soon';
      if (rateLimit && rateLimit.remaining === 0) {
        return {
          ok: false,
          status: 'rate_limited',
          message: `GitHub rate limit reached (0 remaining). Resets at ${resetTime}. Connect a token for 5,000 req/hr.`,
          rateLimit,
        };
      }
      return {
        ok: false,
        status: 'rejected',
        message: 'Access forbidden (HTTP 403). Repository may be private or token lacks permissions.',
        rateLimit,
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        status: 'not_found',
        message: `Repository "${parsed.owner}/${parsed.repo}" not found or private. For private repositories, enter a token with "repo" scope.`,
        rateLimit,
      };
    }

    return {
      ok: false,
      status: 'error',
      message: `GitHub API returned HTTP ${res.status}: ${res.statusText}`,
      rateLimit,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 'error',
      message: `Failed to connect to GitHub: ${msg}`,
    };
  }
}

/** Fetch repository metadata. */
export async function fetchGitHubRepoInfo(
  repoInput: string,
  token?: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ repoInfo: GitHubRepoInfo; rateLimit?: GitHubRateLimit }> {
  const parsed = parseRepoInput(repoInput);
  if (!parsed) throw new Error('Invalid repository. Specify owner/repo.');

  const res = await fetchImpl(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
    headers: getHeaders(token),
  });
  const rateLimit = parseRateLimit(res);

  if (!res.ok) {
    throw new Error(`GitHub API error HTTP ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const repoInfo: GitHubRepoInfo = {
    name: typeof data.name === 'string' ? data.name : parsed.repo,
    fullName: typeof data.full_name === 'string' ? data.full_name : `${parsed.owner}/${parsed.repo}`,
    description: typeof data.description === 'string' ? data.description : '',
    private: !!data.private,
    htmlUrl: typeof data.html_url === 'string' ? data.html_url : `https://github.com/${parsed.owner}/${parsed.repo}`,
    defaultBranch: typeof data.default_branch === 'string' ? data.default_branch : 'main',
    stars: Number(data.stargazers_count) || 0,
    openIssuesCount: Number(data.open_issues_count) || 0,
    topics: Array.isArray(data.topics) ? data.topics.map(String) : [],
  };

  return { repoInfo, rateLimit };
}

/** Fetch README.md content from a repository. */
export async function fetchGitHubReadme(
  repoInput: string,
  token?: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ title: string; content: string; htmlUrl: string } | null> {
  const parsed = parseRepoInput(repoInput);
  if (!parsed) return null;

  try {
    const res = await fetchImpl(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/readme`, {
      headers: getHeaders(token),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.content !== 'string' || !data.content) return null;

    // Decode base64 content safely for UTF-8
    const cleanB64 = data.content.replace(/\s+/g, '');
    const binary = atob(cleanB64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const content = new TextDecoder('utf-8').decode(bytes);

    return {
      title: typeof data.name === 'string' ? data.name : 'README.md',
      content,
      htmlUrl:
        typeof data.html_url === 'string'
          ? data.html_url
          : `https://github.com/${parsed.owner}/${parsed.repo}/blob/main/README.md`,
    };
  } catch {
    return null;
  }
}

/** Fetch issues from a repository. */
export async function fetchGitHubIssues(
  repoInput: string,
  options?: { token?: string; state?: 'open' | 'closed' | 'all'; limit?: number },
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<GitHubIssue[]> {
  const parsed = parseRepoInput(repoInput);
  if (!parsed) return [];

  const state = options?.state || 'open';
  const limit = Math.max(1, Math.min(50, options?.limit || 15));
  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues?state=${state}&per_page=${limit}`;

  try {
    const res = await fetchImpl(url, { headers: getHeaders(options?.token) });
    if (!res.ok) return [];

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];

    return data
      .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
      .map(it => ({
        number: Number(it.number) || 0,
        title: String(it.title || '').trim(),
        body: String(it.body || '').trim(),
        state: it.state === 'closed' ? ('closed' as const) : ('open' as const),
        htmlUrl:
          typeof it.html_url === 'string'
            ? it.html_url
            : `https://github.com/${parsed.owner}/${parsed.repo}/issues/${it.number}`,
        labels: Array.isArray(it.labels)
          ? it.labels
              .map(l =>
                typeof l === 'string'
                  ? l
                  : typeof l === 'object' && l && 'name' in l
                    ? String((l as Record<string, unknown>).name)
                    : '',
              )
              .filter(Boolean)
          : [],
        isPullRequest: !!it.pull_request,
        createdAt: typeof it.created_at === 'string' ? it.created_at : '',
        updatedAt: typeof it.updated_at === 'string' ? it.updated_at : '',
      }));
  } catch {
    return [];
  }
}

/** Fetch recent commits from a repository. */
export async function fetchGitHubCommits(
  repoInput: string,
  options?: { token?: string; limit?: number },
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<GitHubCommit[]> {
  const parsed = parseRepoInput(repoInput);
  if (!parsed) return [];

  const limit = Math.max(1, Math.min(30, options?.limit || 10));
  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=${limit}`;

  try {
    const res = await fetchImpl(url, { headers: getHeaders(options?.token) });
    if (!res.ok) return [];

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];

    return data
      .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
      .map(it => {
        const commit = (typeof it.commit === 'object' && it.commit ? it.commit : {}) as Record<string, unknown>;
        const author = (typeof commit.author === 'object' && commit.author ? commit.author : {}) as Record<
          string,
          unknown
        >;
        const commitAuthor = (typeof it.author === 'object' && it.author ? it.author : {}) as Record<string, unknown>;
        return {
          sha: typeof it.sha === 'string' ? it.sha : '',
          message: typeof commit.message === 'string' ? commit.message : '',
          author:
            typeof author.name === 'string'
              ? author.name
              : typeof commitAuthor.login === 'string'
                ? commitAuthor.login
                : 'Unknown',
          date: typeof author.date === 'string' ? author.date : '',
          htmlUrl:
            typeof it.html_url === 'string'
              ? it.html_url
              : `https://github.com/${parsed.owner}/${parsed.repo}/commit/${it.sha}`,
        };
      });
  } catch {
    return [];
  }
}

/** Convert fetched GitHub data into Brain neural memory entries. */
export function githubToMemoryItems(
  data: {
    repoInfo: GitHubRepoInfo;
    readme?: { title: string; content: string; htmlUrl: string } | null;
    issues?: GitHubIssue[];
    commits?: GitHubCommit[];
  },
  targetProject?: string,
): GitHubRawMemoryItem[] {
  const { repoInfo, readme, issues = [], commits = [] } = data;
  const project = (targetProject || repoInfo.name || 'Brain').trim();
  const items: GitHubRawMemoryItem[] = [];

  // 1. Repository Overview Node
  const repoTopics = repoInfo.topics.length > 0 ? ` Topics: ${repoInfo.topics.join(', ')}.` : '';
  const repoDesc = repoInfo.description ? `${repoInfo.description}.` : 'GitHub repository connected to Brain.';
  const overviewNote = redact(
    `Repository: ${repoInfo.fullName} (${repoInfo.stars}★, ${repoInfo.openIssuesCount} open issues, branch: ${repoInfo.defaultBranch}). ${repoDesc}${repoTopics}\nGitHub URL: ${repoInfo.htmlUrl}`,
  ).text;

  items.push({
    title: `Repo: ${repoInfo.name}`,
    note: overviewNote.slice(0, 1000),
    type: 'concept',
    project,
    kws: keywords(`${repoInfo.name} ${repoInfo.fullName} ${repoInfo.description}`).slice(0, 8),
    sources: [
      {
        kind: 'github',
        label: `GitHub: ${repoInfo.fullName}`,
        ref: repoInfo.htmlUrl,
      },
    ],
  });

  // 2. README Sections
  if (readme?.content) {
    const cleanReadme = redact(readme.content).text;
    const headingRegex = /^#{1,3}\s+(.+)$/gm;
    const matches: { index: number; title: string; length: number }[] = [];
    let match = headingRegex.exec(cleanReadme);

    while (match !== null) {
      matches.push({ index: match.index, title: match[1].trim(), length: match[0].length });
      match = headingRegex.exec(cleanReadme);
    }

    if (matches.length > 1) {
      const maxSections = Math.min(5, matches.length);
      for (let i = 0; i < maxSections; i++) {
        const cur = matches[i];
        const start = cur.index + cur.length;
        const end = i + 1 < matches.length ? matches[i + 1].index : cleanReadme.length;
        const body = cleanReadme.slice(start, end).trim();
        if (body && body.length > 20) {
          const sectionTitle = `${repoInfo.name}: ${cur.title}`.slice(0, 80);
          items.push({
            title: sectionTitle,
            note: body.slice(0, 1000),
            type: 'concept',
            project,
            kws: keywords(`${cur.title} ${body}`).slice(0, 8),
            sources: [
              {
                kind: 'github',
                label: `GitHub: ${repoInfo.name} (${cur.title.slice(0, 30)})`,
                ref: readme.htmlUrl,
              },
            ],
          });
        }
      }
    } else {
      items.push({
        title: `${repoInfo.name} Documentation`,
        note: cleanReadme.slice(0, 1000),
        type: 'concept',
        project,
        kws: keywords(`${repoInfo.name} documentation ${cleanReadme}`).slice(0, 8),
        sources: [
          {
            kind: 'github',
            label: `GitHub: ${repoInfo.name} README`,
            ref: readme.htmlUrl,
          },
        ],
      });
    }
  }

  // 3. Issues & Pull Requests
  for (const issue of issues) {
    const isPr = issue.isPullRequest;
    const prefix = isPr ? 'PR' : 'Issue';
    const title = `${repoInfo.name} ${prefix} #${issue.number}: ${issue.title}`.slice(0, 80);
    const labels = issue.labels.length > 0 ? `Labels: [${issue.labels.join(', ')}]. ` : '';
    const bodyText = issue.body ? `\n\n${issue.body}` : '';
    const note = redact(`Status: ${issue.state.toUpperCase()}. ${labels}${bodyText}`).text.slice(0, 1000);

    items.push({
      title,
      note,
      type: isPr ? 'workstream' : 'entity',
      project,
      kws: keywords(`${prefix} ${issue.title} ${issue.labels.join(' ')}`).slice(0, 8),
      sources: [
        {
          kind: 'github',
          label: `GitHub: ${repoInfo.fullName}#${issue.number}`,
          ref: issue.htmlUrl,
        },
      ],
    });
  }

  // 4. Recent Commits
  for (const commit of commits.slice(0, 8)) {
    const shortSha = commit.sha.slice(0, 7);
    const firstLine = commit.message.split('\n')[0].trim();
    const title = `${repoInfo.name} Commit ${shortSha}: ${firstLine}`.slice(0, 80);
    const note = redact(
      `Author: ${commit.author} (${commit.date ? commit.date.slice(0, 10) : 'recent'}).\n${commit.message}`,
    ).text.slice(0, 1000);

    items.push({
      title,
      note,
      type: 'workstream',
      project,
      kws: keywords(`commit ${shortSha} ${firstLine} ${commit.author}`).slice(0, 8),
      sources: [
        {
          kind: 'github',
          label: `GitHub: ${repoInfo.name}@${shortSha}`,
          ref: commit.htmlUrl,
        },
      ],
    });
  }

  return items;
}

/** Complete one-shot fetch and convert of GitHub data for import into Brain. */
export async function fetchAndConvertGitHub(
  repoInput: string,
  options?: GitHubImportOptions,
  token?: string,
  project?: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ items: GitHubRawMemoryItem[]; repoInfo: GitHubRepoInfo; summary: string }> {
  const { repoInfo } = await fetchGitHubRepoInfo(repoInput, token, fetchImpl);

  const includeReadme = options?.includeReadme !== false;
  const includeIssues = options?.includeIssues !== false;
  const includeCommits = options?.includeCommits !== false;

  const [readme, issues, commits] = await Promise.all([
    includeReadme ? fetchGitHubReadme(repoInput, token, fetchImpl) : Promise.resolve(null),
    includeIssues
      ? fetchGitHubIssues(repoInput, { token, state: options?.issueState, limit: options?.maxIssues }, fetchImpl)
      : Promise.resolve([]),
    includeCommits
      ? fetchGitHubCommits(repoInput, { token, limit: options?.maxCommits }, fetchImpl)
      : Promise.resolve([]),
  ]);

  const items = githubToMemoryItems({ repoInfo, readme, issues, commits }, project);
  const summary = `Found ${items.length} items from ${repoInfo.fullName} (${readme ? 'README, ' : ''}${issues.length} issues, ${commits.length} commits)`;

  return { items, repoInfo, summary };
}
