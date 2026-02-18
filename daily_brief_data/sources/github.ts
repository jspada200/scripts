import axios, { AxiosInstance } from 'axios';
import type { GitHubBrief, GitHubIssue, GitHubPR, GitHubPRComment } from '../types.js';

const REPO_OWNER = 'AcademySoftwareFoundation';
const REPO_NAME = 'dna';

function getGitHubClient(): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'daily-brief-script',
    },
  });
}

function get24HoursAgo(): string {
  const date = new Date();
  date.setHours(date.getHours() - 24);
  return date.toISOString();
}

async function fetchRecentIssues(client: AxiosInstance): Promise<GitHubIssue[]> {
  const since = get24HoursAgo();
  
  const response = await client.get(`/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
    params: {
      since,
      state: 'all',
      per_page: 50,
      sort: 'created',
      direction: 'desc',
    },
  });

  const items = response.data || [];
  
  // Filter to only issues (not PRs) created in the last 24 hours
  const oneDayAgo = new Date(since);
  
  return items
    .filter((item: any) => {
      // GitHub returns PRs in the issues endpoint, filter them out
      if (item.pull_request) return false;
      // Only include issues created (not just updated) in last 24 hours
      const createdAt = new Date(item.created_at);
      return createdAt >= oneDayAgo;
    })
    .map((issue: any): GitHubIssue => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      author: issue.user?.login || 'unknown',
      createdAt: issue.created_at,
      labels: (issue.labels || []).map((l: any) => l.name),
    }));
}

async function fetchPRComments(client: AxiosInstance, prNumber: number): Promise<GitHubPRComment[]> {
  try {
    // Fetch review comments (inline code comments)
    const reviewCommentsResponse = await client.get(
      `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/comments`,
      { params: { per_page: 20 } }
    );

    // Fetch issue comments (general PR discussion)
    const issueCommentsResponse = await client.get(
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNumber}/comments`,
      { params: { per_page: 20 } }
    );

    const reviewComments = (reviewCommentsResponse.data || []).map((c: any): GitHubPRComment => ({
      author: c.user?.login || 'unknown',
      body: c.body?.substring(0, 500) || '', // Truncate long comments
      createdAt: c.created_at,
    }));

    const issueComments = (issueCommentsResponse.data || []).map((c: any): GitHubPRComment => ({
      author: c.user?.login || 'unknown',
      body: c.body?.substring(0, 500) || '',
      createdAt: c.created_at,
    }));

    // Combine and sort by date
    return [...reviewComments, ...issueComments]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10); // Limit to 10 most recent
  } catch (error) {
    console.warn(`Could not fetch comments for PR #${prNumber}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchPRsAwaitingFeedback(client: AxiosInstance): Promise<GitHubPR[]> {
  // Fetch open PRs
  const response = await client.get(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
    params: {
      state: 'open',
      per_page: 20,
      sort: 'updated',
      direction: 'desc',
    },
  });

  const prs = response.data || [];

  // Fetch comments for each PR (with rate limiting consideration)
  const prsWithComments: GitHubPR[] = [];

  for (const pr of prs) {
    // Add a small delay to avoid rate limiting on public API
    if (prsWithComments.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const comments = await fetchPRComments(client, pr.number);

    // Determine review state based on requested reviewers
    let reviewState = 'pending';
    if (pr.requested_reviewers?.length > 0) {
      reviewState = 'review_requested';
    } else if (pr.draft) {
      reviewState = 'draft';
    }

    prsWithComments.push({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.html_url,
      author: pr.user?.login || 'unknown',
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      draft: pr.draft || false,
      reviewState,
      comments,
    });
  }

  return prsWithComments;
}

export async function fetchGitHubBrief(): Promise<GitHubBrief> {
  try {
    const client = getGitHubClient();
    
    const [recentIssues, prsAwaitingFeedback] = await Promise.all([
      fetchRecentIssues(client),
      fetchPRsAwaitingFeedback(client),
    ]);

    return {
      recentIssues,
      prsAwaitingFeedback,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('GitHub fetch error:', errorMessage);
    
    return {
      recentIssues: [],
      prsAwaitingFeedback: [],
      error: errorMessage,
    };
  }
}
