import axios, { AxiosInstance } from 'axios';
import type { JiraBrief, JiraTicket, JiraNotification, JiraComment } from '../types.js';

function getJiraClient(): AxiosInstance {
  const baseUrl = process.env.JIRA_BASE_URL;
  const pat = process.env.JIRA_PAT;
  const username = process.env.JIRA_USERNAME;

  if (!baseUrl || !pat || !username) {
    throw new Error('Missing Jira configuration. Set JIRA_BASE_URL, JIRA_PAT, and JIRA_USERNAME in .env');
  }

  return axios.create({
    baseURL: baseUrl,
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
  });
}

function getCurrentSprintName(): string {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = now.getFullYear();
  return `PT ${month} ${year}`;
}

async function fetchNotifications(client: AxiosInstance): Promise<JiraNotification[]> {
  try {
    // Jira Cloud uses /rest/api/2/myself to get current user notifications
    // For Jira Server, we'll try the notification scheme or fall back to empty
    const response = await client.get('/rest/api/2/myself');
    
    // Note: Jira REST API doesn't have a direct notifications endpoint in v2
    // This would typically be done via webhooks or polling recent activity
    // For now, we'll return an empty array and note this limitation
    console.log('Note: Jira notifications require webhook setup or activity stream parsing');
    return [];
  } catch (error) {
    console.warn('Could not fetch Jira notifications:', error instanceof Error ? error.message : error);
    return [];
  }
}

function parseComments(commentData: any): JiraComment[] {
  if (!commentData?.comments) return [];
  
  return commentData.comments.map((comment: any): JiraComment => ({
    id: comment.id,
    author: comment.author?.displayName || comment.author?.name || 'Unknown',
    body: comment.body,
    created: comment.created,
  }));
}

async function fetchSprintTickets(client: AxiosInstance, sprintName: string): Promise<JiraTicket[]> {
  const username = process.env.JIRA_USERNAME;
  const baseUrl = process.env.JIRA_BASE_URL;
  
  // JQL to find tickets assigned to user in the current sprint
  const jql = `assignee = ${username} AND sprint in openSprints() AND sprint ~ "${sprintName}" ORDER BY updated DESC`;
  
  try {
    const response = await client.get('/rest/api/2/search', {
      params: {
        jql,
        fields: 'key,summary,status,priority,assignee,updated,comment',
        maxResults: 50,
      },
    });

    const issues = response.data.issues || [];
    
    return issues.map((issue: any): JiraTicket => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name || 'Unknown',
      priority: issue.fields.priority?.name || 'None',
      assignee: issue.fields.assignee?.displayName || 'Unassigned',
      updated: issue.fields.updated,
      url: `${baseUrl}/browse/${issue.key}`,
      comments: parseComments(issue.fields.comment),
    }));
  } catch (error) {
    // If sprint-based query fails, try just open sprints
    console.warn(`Sprint query with name "${sprintName}" failed, trying open sprints only`);
    
    try {
      const fallbackJql = `assignee = ${username} AND sprint in openSprints() ORDER BY updated DESC`;
      const response = await client.get('/rest/api/2/search', {
        params: {
          jql: fallbackJql,
          fields: 'key,summary,status,priority,assignee,updated,comment',
          maxResults: 50,
        },
      });

      const issues = response.data.issues || [];
      
      return issues.map((issue: any): JiraTicket => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown',
        priority: issue.fields.priority?.name || 'None',
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        updated: issue.fields.updated,
        url: `${baseUrl}/browse/${issue.key}`,
        comments: parseComments(issue.fields.comment),
      }));
    } catch (fallbackError) {
      throw new Error(`Failed to fetch Jira tickets: ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`);
    }
  }
}

export async function fetchJiraBrief(): Promise<JiraBrief> {
  try {
    const client = getJiraClient();
    const sprintName = getCurrentSprintName();
    
    const [notifications, sprintTickets] = await Promise.all([
      fetchNotifications(client),
      fetchSprintTickets(client, sprintName),
    ]);

    return {
      notifications,
      sprintTickets,
      sprintName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Jira fetch error:', errorMessage);
    
    return {
      notifications: [],
      sprintTickets: [],
      sprintName: getCurrentSprintName(),
      error: errorMessage,
    };
  }
}
