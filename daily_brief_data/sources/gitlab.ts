import axios, { AxiosInstance } from 'axios';
import type { GitLabBrief, GitLabMergeRequest, GitLabTodo, GitLabComment, GitLabPipeline } from '../types.js';

function getGitLabClient(): AxiosInstance {
  const baseUrl = process.env.GITLAB_BASE_URL;
  const pat = process.env.GITLAB_PAT;

  if (!baseUrl || !pat) {
    throw new Error('Missing GitLab configuration. Set GITLAB_BASE_URL and GITLAB_PAT in .env');
  }

  return axios.create({
    baseURL: `${baseUrl}/api/v4`,
    headers: {
      'PRIVATE-TOKEN': pat,
      'Content-Type': 'application/json',
    },
  });
}

async function getCurrentUserId(client: AxiosInstance): Promise<number> {
  const response = await client.get('/user');
  return response.data.id;
}

async function fetchMRComments(client: AxiosInstance, projectId: number, mrIid: number): Promise<GitLabComment[]> {
  try {
    const response = await client.get(`/projects/${projectId}/merge_requests/${mrIid}/notes`, {
      params: {
        per_page: 100,
        sort: 'desc',
      },
    });

    const notes = response.data || [];
    
    return notes
      .filter((note: any) => !note.system)
      .map((note: any): GitLabComment => ({
        id: note.id,
        author: note.author?.name || note.author?.username || 'Unknown',
        body: note.body,
        createdAt: note.created_at,
      }));
  } catch (error) {
    console.warn(`Could not fetch comments for MR !${mrIid}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchMRPipeline(client: AxiosInstance, projectId: number, mrIid: number): Promise<GitLabPipeline | null> {
  try {
    const response = await client.get(`/projects/${projectId}/merge_requests/${mrIid}/pipelines`, {
      params: {
        per_page: 1,
      },
    });

    const pipelines = response.data || [];
    
    if (pipelines.length === 0) return null;

    const pipeline = pipelines[0];
    return {
      id: pipeline.id,
      status: pipeline.status,
      webUrl: pipeline.web_url,
      createdAt: pipeline.created_at,
    };
  } catch (error) {
    console.warn(`Could not fetch pipeline for MR !${mrIid}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function fetchMergeRequests(client: AxiosInstance, userId: number): Promise<GitLabMergeRequest[]> {
  const response = await client.get('/merge_requests', {
    params: {
      state: 'opened',
      author_id: userId,
      scope: 'all',
      per_page: 50,
    },
  });

  const mrs = response.data || [];

  const mrPromises = mrs.map(async (mr: any): Promise<GitLabMergeRequest> => {
    const projectId = mr.project_id;
    const mrIid = mr.iid;

    const [comments, pipeline] = await Promise.all([
      fetchMRComments(client, projectId, mrIid),
      fetchMRPipeline(client, projectId, mrIid),
    ]);

    return {
      id: mr.id,
      iid: mr.iid,
      projectId: mr.project_id,
      title: mr.title,
      state: mr.state,
      webUrl: mr.web_url,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      createdAt: mr.created_at,
      updatedAt: mr.updated_at,
      mergeStatus: mr.merge_status || mr.detailed_merge_status || 'unknown',
      draft: mr.draft || mr.work_in_progress || false,
      approvals: mr.upvotes || 0,
      reviewers: (mr.reviewers || []).map((r: any) => r.name || r.username),
      comments,
      pipeline,
    };
  });

  return Promise.all(mrPromises);
}

async function fetchTodos(client: AxiosInstance): Promise<GitLabTodo[]> {
  const response = await client.get('/todos', {
    params: {
      state: 'pending',
      per_page: 50,
    },
  });

  const todos = response.data || [];

  return todos.map((todo: any): GitLabTodo => ({
    id: todo.id,
    targetType: todo.target_type,
    targetTitle: todo.target?.title || todo.body || 'Unknown',
    targetUrl: todo.target_url,
    actionName: todo.action_name,
    createdAt: todo.created_at,
    projectName: todo.project?.name || todo.project?.path_with_namespace || 'Unknown',
  }));
}

export async function fetchGitLabBrief(): Promise<GitLabBrief> {
  try {
    const client = getGitLabClient();
    
    // Get current user ID first
    const userId = await getCurrentUserId(client);
    
    const [mergeRequests, todos] = await Promise.all([
      fetchMergeRequests(client, userId),
      fetchTodos(client),
    ]);

    return {
      mergeRequests,
      todos,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('GitLab fetch error:', errorMessage);
    
    return {
      mergeRequests: [],
      todos: [],
      error: errorMessage,
    };
  }
}
