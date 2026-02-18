// Jira Types
export interface JiraComment {
  id: string;
  author: string;
  body: string;
  created: string;
}

export interface JiraTicket {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string;
  updated: string;
  url: string;
  comments: JiraComment[];
}

export interface JiraNotification {
  id: string;
  title: string;
  message: string;
  created: string;
  read: boolean;
}

export interface JiraBrief {
  notifications: JiraNotification[];
  sprintTickets: JiraTicket[];
  sprintName: string;
  error?: string;
}

// GitLab Types
export interface GitLabComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface GitLabPipeline {
  id: number;
  status: string;
  webUrl: string;
  createdAt: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  projectId: number;
  title: string;
  state: string;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  updatedAt: string;
  mergeStatus: string;
  draft: boolean;
  approvals: number;
  reviewers: string[];
  comments: GitLabComment[];
  pipeline: GitLabPipeline | null;
}

export interface GitLabTodo {
  id: number;
  targetType: string;
  targetTitle: string;
  targetUrl: string;
  actionName: string;
  createdAt: string;
  projectName: string;
}

export interface GitLabBrief {
  mergeRequests: GitLabMergeRequest[];
  todos: GitLabTodo[];
  error?: string;
}

// GitHub Types
export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  createdAt: string;
  labels: string[];
}

export interface GitHubPRComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  reviewState: string;
  comments: GitHubPRComment[];
}

export interface GitHubBrief {
  recentIssues: GitHubIssue[];
  prsAwaitingFeedback: GitHubPR[];
  error?: string;
}

// Combined Daily Brief
export interface DailyBrief {
  generatedAt: string;
  jira: JiraBrief;
  gitlab: GitLabBrief;
  github: GitHubBrief;
}

// Data Source Interface (for extensibility)
export interface DataSource<T> {
  name: string;
  fetch: () => Promise<T>;
}
