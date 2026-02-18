import type { JiraBrief, GitLabBrief, GitHubBrief } from './types.js';
import { fetchJiraBrief } from './sources/jira.js';
import { fetchGitLabBrief } from './sources/gitlab.js';
import { fetchGitHubBrief } from './sources/github.js';

// =============================================================================
// DATA SOURCES CONFIGURATION
// =============================================================================
// Set 'enabled: true' to include a source, 'enabled: false' to skip it.
// Add new sources by creating a file in sources/ and adding an entry here.
// =============================================================================

export interface SourceConfig<T> {
  name: string;
  enabled: boolean;
  fetch: () => Promise<T>;
  emptyState: T;
}

export const sources = {
  jira: {
    name: 'Jira',
    enabled: true,
    fetch: fetchJiraBrief,
    emptyState: {
      notifications: [],
      sprintTickets: [],
      sprintName: 'N/A',
      error: 'Source disabled',
    } as JiraBrief,
  },

  gitlab: {
    name: 'GitLab',
    enabled: true,
    fetch: fetchGitLabBrief,
    emptyState: {
      mergeRequests: [],
      todos: [],
      error: 'Source disabled',
    } as GitLabBrief,
  },

  github: {
    name: 'GitHub',
    enabled: false,
    fetch: fetchGitHubBrief,
    emptyState: {
      recentIssues: [],
      prsAwaitingFeedback: [],
      error: 'Source disabled',
    } as GitHubBrief,
  },

  // -------------------------------------------------------------------------
  // ADD NEW SOURCES HERE
  // -------------------------------------------------------------------------
  // Example:
  //
  // slack: {
  //   name: 'Slack',
  //   enabled: false,
  //   fetch: fetchSlackBrief,
  //   emptyState: {
  //     messages: [],
  //     error: 'Source disabled',
  //   } as SlackBrief,
  // },
  // -------------------------------------------------------------------------
};

export type SourceKey = keyof typeof sources;
