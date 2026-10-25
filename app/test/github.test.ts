import { describe, expect, it } from 'vitest';
import {
  fetchAndConvertGitHub,
  fetchGitHubCommits,
  fetchGitHubIssues,
  fetchGitHubReadme,
  fetchGitHubReleases,
  fetchGitHubRepoInfo,
  githubToMemoryItems,
  parseRepoInput,
  testGitHubConnection,
  type GitHubRelease,
  type GitHubRepoInfo,
} from '../src/lib/github';

describe('GitHub Connector - Repository Input Parsing', () => {
  it('parses standard owner/repo format', () => {
    expect(parseRepoInput('Roooted1776/Brain')).toEqual({
      owner: 'Roooted1776',
      repo: 'Brain',
    });
    expect(parseRepoInput('  facebook/react  ')).toEqual({
      owner: 'facebook',
      repo: 'react',
    });
  });

  it('parses GitHub HTTPS URLs', () => {
    expect(parseRepoInput('https://github.com/Roooted1776/Brain')).toEqual({
      owner: 'Roooted1776',
      repo: 'Brain',
    });
    expect(parseRepoInput('https://github.com/Roooted1776/Brain.git')).toEqual({
      owner: 'Roooted1776',
      repo: 'Brain',
    });
    expect(parseRepoInput('https://github.com/Roooted1776/Brain/tree/main')).toEqual({
      owner: 'Roooted1776',
      repo: 'Brain',
    });
  });

  it('parses GitHub SSH URLs', () => {
    expect(parseRepoInput('git@github.com:Roooted1776/Brain.git')).toEqual({
      owner: 'Roooted1776',
      repo: 'Brain',
    });
  });

  it('rejects invalid repository strings', () => {
    expect(parseRepoInput('')).toBeNull();
    expect(parseRepoInput('just-a-name')).toBeNull();
    expect(parseRepoInput('invalid / name with spaces')).toBeNull();
    expect(parseRepoInput('https://gitlab.com/user/repo')).toBeNull();
  });
});

describe('GitHub Connector - Connection & API Client', () => {
  it('tests connection successfully and parses rate limit headers', async () => {
    const fakeFetch = async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/repos/Roooted1776/Brain')) {
        return new Response(
          JSON.stringify({
            name: 'Brain',
            full_name: 'Roooted1776/Brain',
            description: 'Orchestration Brain',
            private: false,
            html_url: 'https://github.com/Roooted1776/Brain',
            default_branch: 'main',
            stargazers_count: 42,
            open_issues_count: 3,
            topics: ['ai', 'threejs', 'memory'],
          }),
          {
            status: 200,
            headers: {
              'x-ratelimit-limit': '5000',
              'x-ratelimit-remaining': '4990',
              'x-ratelimit-reset': '1800000000',
            },
          },
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const res = await testGitHubConnection('Roooted1776/Brain', 'ghp_faketoken123', fakeFetch as typeof fetch);
    expect(res.ok).toBe(true);
    expect(res.status).toBe('connected');
    expect(res.message).toContain('Roooted1776/Brain');
    expect(res.message).toContain('4990/5000');
    expect(res.repoInfo?.stars).toBe(42);
    expect(res.rateLimit?.remaining).toBe(4990);
  });

  it('handles 401 Unauthorized for bad tokens', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
    const res = await testGitHubConnection('Roooted1776/Brain', 'invalid_token', fakeFetch as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.status).toBe('rejected');
    expect(res.message).toContain('HTTP 401');
  });

  it('handles 403 Rate Limit Exceeded', async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403,
        headers: {
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1800000000',
        },
      });
    const res = await testGitHubConnection('Roooted1776/Brain', undefined, fakeFetch as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.status).toBe('rate_limited');
    expect(res.message).toContain('rate limit reached');
  });

  it('handles 404 Not Found repository', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    const res = await testGitHubConnection('Roooted1776/NonExistent', undefined, fakeFetch as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.status).toBe('not_found');
    expect(res.message).toContain('not found or private');
  });
});

describe('GitHub Connector - Data Fetching & Decoding', () => {
  it('fetches repository info directly', async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          name: 'Brain',
          full_name: 'Roooted1776/Brain',
          description: 'Orchestration Brain',
          private: false,
          html_url: 'https://github.com/Roooted1776/Brain',
          default_branch: 'main',
          stargazers_count: 50,
          open_issues_count: 2,
          topics: ['brain'],
        }),
        { status: 200 },
      );

    const { repoInfo } = await fetchGitHubRepoInfo('Roooted1776/Brain', undefined, fakeFetch as typeof fetch);
    expect(repoInfo.name).toBe('Brain');
    expect(repoInfo.fullName).toBe('Roooted1776/Brain');
    expect(repoInfo.stars).toBe(50);
  });

  it('fetches and base64-decodes UTF-8 README content', async () => {
    const textContent =
      '# Brain Orchestration\nNeural 3D graph and AI collaboration.\n\n## Features\n- Real AI\n- Memory persistence';
    const b64 = btoa(textContent);

    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          name: 'README.md',
          content: b64,
          html_url: 'https://github.com/Roooted1776/Brain/blob/main/README.md',
        }),
        { status: 200 },
      );

    const readme = await fetchGitHubReadme('Roooted1776/Brain', undefined, fakeFetch as typeof fetch);
    expect(readme).not.toBeNull();
    expect(readme?.title).toBe('README.md');
    expect(readme?.content).toContain('# Brain Orchestration');
    expect(readme?.content).toContain('Neural 3D graph');
  });

  it('fetches issues and parses metadata', async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify([
          {
            number: 101,
            title: 'Add GitHub connector for neural memory',
            body: 'Users should be able to connect repositories and import knowledge.',
            state: 'open',
            html_url: 'https://github.com/Roooted1776/Brain/issues/101',
            labels: [{ name: 'enhancement' }, { name: 'core' }],
            created_at: '2026-10-25T00:00:00Z',
          },
          {
            number: 102,
            title: 'Fix mobile classification band wrapping',
            body: 'Resolved layout issues on narrow screens.',
            state: 'closed',
            html_url: 'https://github.com/Roooted1776/Brain/issues/102',
            labels: ['bug'],
            pull_request: {},
          },
        ]),
        { status: 200 },
      );

    const issues = await fetchGitHubIssues('Roooted1776/Brain', { state: 'all' }, fakeFetch as typeof fetch);
    expect(issues.length).toBe(2);
    expect(issues[0].number).toBe(101);
    expect(issues[0].title).toBe('Add GitHub connector for neural memory');
    expect(issues[0].labels).toEqual(['enhancement', 'core']);
    expect(issues[0].isPullRequest).toBe(false);
    expect(issues[1].isPullRequest).toBe(true);
  });

  it('fetches commits and parses author and sha', async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify([
          {
            sha: 'abcdef1234567890abcdef1234567890abcdef12',
            commit: {
              message: 'feat: automated GitHub push pipeline\n\nVerified check workflow.',
              author: { name: 'Max', date: '2026-10-25T01:15:00Z' },
            },
            html_url: 'https://github.com/Roooted1776/Brain/commit/abcdef1',
          },
        ]),
        { status: 200 },
      );

    const commits = await fetchGitHubCommits('Roooted1776/Brain', { limit: 5 }, fakeFetch as typeof fetch);
    expect(commits.length).toBe(1);
    expect(commits[0].sha).toBe('abcdef1234567890abcdef1234567890abcdef12');
    expect(commits[0].author).toBe('Max');
    expect(commits[0].message).toContain('automated GitHub push pipeline');
  });

  it('fetches releases and parses tag and release notes', async () => {
    const fakeFetch = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('/releases');
      return new Response(
        JSON.stringify([
          {
            tag_name: 'v2.4.0',
            name: 'Brain v2.4.0 Neural Connectors',
            body: 'Added GitHub repository connector and task project grouping.',
            published_at: '2026-10-25T02:00:00Z',
            html_url: 'https://github.com/Roooted1776/Brain/releases/tag/v2.4.0',
            prerelease: false,
          },
        ]),
        { status: 200 },
      );
    };

    const releases = await fetchGitHubReleases('Roooted1776/Brain', { limit: 5 }, fakeFetch as typeof fetch);
    expect(releases.length).toBe(1);
    expect(releases[0].tagName).toBe('v2.4.0');
    expect(releases[0].name).toContain('Neural Connectors');
    expect(releases[0].body).toContain('Added GitHub repository connector');
  });

  it('passes since timestamp for differential issues and commits queries', async () => {
    let issueUrl = '';
    let commitUrl = '';
    const fakeFetch = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/issues')) issueUrl = u;
      if (u.includes('/commits')) commitUrl = u;
      return new Response(JSON.stringify([]), { status: 200 });
    };

    const since = '2026-10-24T12:00:00Z';
    await fetchGitHubIssues('Roooted1776/Brain', { since }, fakeFetch as typeof fetch);
    await fetchGitHubCommits('Roooted1776/Brain', { since }, fakeFetch as typeof fetch);

    expect(issueUrl).toContain(`since=${encodeURIComponent(since)}`);
    expect(commitUrl).toContain(`since=${encodeURIComponent(since)}`);
  });
});

describe('GitHub Connector - Memory Items Conversion', () => {
  const repoInfo: GitHubRepoInfo = {
    name: 'Brain',
    fullName: 'Roooted1776/Brain',
    description: 'Personal orchestration brain and neural 3D memory',
    private: false,
    htmlUrl: 'https://github.com/Roooted1776/Brain',
    defaultBranch: 'main',
    stars: 100,
    openIssuesCount: 2,
    topics: ['orchestration', 'react', 'threejs'],
  };

  it('converts repository overview, README, issues, and commits into memory entries', () => {
    const readme = {
      title: 'README.md',
      content: '# Architecture\nBrain connects 9 AI agents.\n\n# Neural Memory\nConcept and entity persistence.',
      htmlUrl: 'https://github.com/Roooted1776/Brain/blob/main/README.md',
    };

    const issues = [
      {
        number: 42,
        title: 'Add GitHub connector',
        body: 'Sync repo issues and docs into Brain memory.',
        state: 'open' as const,
        htmlUrl: 'https://github.com/Roooted1776/Brain/issues/42',
        labels: ['feature'],
        isPullRequest: false,
        createdAt: '2026-10-25T00:00:00Z',
        updatedAt: '2026-10-25T00:00:00Z',
      },
    ];

    const commits = [
      {
        sha: '71772950667a08a2ec0099e4e58b7b56f153872c',
        message: 'feat: automated GitHub push pipeline',
        author: 'Claude',
        date: '2026-10-25T01:15:00Z',
        htmlUrl: 'https://github.com/Roooted1776/Brain/commit/7177295',
      },
    ];

    const items = githubToMemoryItems({ repoInfo, readme, issues, commits }, 'Brain');
    expect(items.length).toBeGreaterThanOrEqual(4);

    // Repo overview node
    const overview = items.find(it => it.title === 'Repo: Brain');
    expect(overview).toBeDefined();
    expect(overview?.type).toBe('concept');
    expect(overview?.sources[0].kind).toBe('github');
    expect(overview?.sources[0].ref).toBe('https://github.com/Roooted1776/Brain');

    // Section nodes from README
    const archSection = items.find(it => it.title.includes('Architecture'));
    expect(archSection).toBeDefined();
    expect(archSection?.note).toContain('Brain connects 9 AI agents');
    expect(archSection?.sources[0].kind).toBe('github');

    // Issue node
    const issueItem = items.find(it => it.title.includes('Issue #42'));
    expect(issueItem).toBeDefined();
    expect(issueItem?.type).toBe('entity');
    expect(issueItem?.sources[0].ref).toBe('https://github.com/Roooted1776/Brain/issues/42');

    // Commit node
    const commitItem = items.find(it => it.title.includes('7177295'));
    expect(commitItem).toBeDefined();
    expect(commitItem?.type).toBe('workstream');
    expect(commitItem?.note).toContain('Claude');
  });

  it('redacts sensitive tokens in GitHub content', () => {
    const issues = [
      {
        number: 55,
        title: 'Leaked token sk-ant-api03-secret123456789012345 in issue',
        body: 'Do not share sk-live-secrettoken123456789012345 in public.',
        state: 'open' as const,
        htmlUrl: 'https://github.com/Roooted1776/Brain/issues/55',
        labels: [],
        isPullRequest: false,
        createdAt: '2026-10-25T00:00:00Z',
        updatedAt: '2026-10-25T00:00:00Z',
      },
    ];

    const items = githubToMemoryItems({ repoInfo, issues }, 'Brain');
    const issueItem = items.find(it => it.title.includes('Issue #55'));
    expect(issueItem?.note).toContain('[filtered]');
    expect(issueItem?.note).not.toContain('sk-live-secrettoken');
  });
});

describe('GitHub Connector - End to End Fetch & Convert', () => {
  it('fetches all data in parallel and produces memory items with summary', async () => {
    const fakeFetch = async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/repos/Roooted1776/Brain')) {
        return new Response(
          JSON.stringify({
            name: 'Brain',
            full_name: 'Roooted1776/Brain',
            description: 'AI Orchestration Graph',
            private: false,
            html_url: 'https://github.com/Roooted1776/Brain',
            default_branch: 'main',
            stargazers_count: 50,
            open_issues_count: 1,
            topics: [],
          }),
          { status: 200 },
        );
      }
      if (u.endsWith('/readme')) {
        return new Response(
          JSON.stringify({
            name: 'README.md',
            content: btoa('# Brain Project\nConnected sources and neural nodes.'),
            html_url: 'https://github.com/Roooted1776/Brain/blob/main/README.md',
          }),
          { status: 200 },
        );
      }
      if (u.includes('/issues')) {
        return new Response(
          JSON.stringify([
            {
              number: 1,
              title: 'First Issue',
              body: 'Welcome to Brain repository.',
              state: 'open',
              html_url: 'https://github.com/Roooted1776/Brain/issues/1',
              labels: [],
            },
          ]),
          { status: 200 },
        );
      }
      if (u.includes('/commits')) {
        return new Response(
          JSON.stringify([
            {
              sha: '1234567890abcdef',
              commit: {
                message: 'Initial commit',
                author: { name: 'Owner', date: '2026-10-24' },
              },
              html_url: 'https://github.com/Roooted1776/Brain/commit/1234567',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const result = await fetchAndConvertGitHub(
      'Roooted1776/Brain',
      { includeReadme: true, includeIssues: true, includeCommits: true },
      undefined,
      'TestProject',
      fakeFetch as typeof fetch,
    );

    expect(result.items.length).toBeGreaterThanOrEqual(4);
    expect(result.repoInfo.name).toBe('Brain');
    expect(result.summary).toContain('Found');
    expect(result.summary).toContain('Roooted1776/Brain');
    expect(result.items.every(it => it.project === 'TestProject')).toBe(true);
  });
});
