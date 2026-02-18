# Daily Brief Data Aggregator

A modular TypeScript script that queries multiple APIs (Jira, GitLab, GitHub) and aggregates the data into a structured JSON report, optionally emailing it to a specified recipient.

## Features

- **Jira Integration**: Fetches sprint tickets and notifications
- **GitLab Integration**: Fetches your merge requests and to-do items
- **GitHub Integration**: Fetches recent issues and open PRs with discussion context
- **Email Delivery**: Sends formatted HTML email with JSON attachment
- **Dry Run Mode**: Preview output without sending email
- **Modular Architecture**: Easy to add new data sources

## Installation

```bash
cd daily_brief_data
npm install
```

## Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `JIRA_BASE_URL` | Your Jira instance URL (e.g., `https://jira.com`) |
| `JIRA_USERNAME` | Your Jira username |
| `JIRA_PASSWORD` | Your Jira password |
| `GITLAB_BASE_URL` | Your GitLab instance URL (e.g., `https://gitlab.com`) |
| `GITLAB_PAT` | GitLab Personal Access Token with `read_api` scope |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port (usually 587 or 465) |
| `SMTP_USER` | SMTP authentication username |
| `SMTP_PASS` | SMTP authentication password |
| `EMAIL_FROM` | Sender email address |
| `EMAIL_RECIPIENT` | Recipient email address |

## Usage

### Run with Email Delivery

```bash
npm start
# or
npx tsx index.ts
```

### Dry Run (Console Output Only)

```bash
npm run dry-run
# or
npx tsx index.ts --dry-run
```

### Type Checking

```bash
npm run typecheck
```

## Output Structure

The script generates a `DailyBrief` JSON object with the following structure:

```json
{
  "generatedAt": "2024-01-15T09:00:00.000Z",
  "jira": {
    "notifications": [],
    "sprintTickets": [
      {
        "key": "PROJ-123",
        "summary": "Ticket title",
        "status": "In Progress",
        "priority": "High",
        "assignee": "John Doe",
        "updated": "2024-01-15T08:30:00.000Z",
        "url": "https://jira.example.com/browse/PROJ-123"
      }
    ],
    "sprintName": "PT January 2024"
  },
  "gitlab": {
    "mergeRequests": [
      {
        "iid": 42,
        "title": "Feature: Add new component",
        "state": "opened",
        "webUrl": "https://gitlab.example.com/project/-/merge_requests/42",
        "sourceBranch": "feature/new-component",
        "targetBranch": "main",
        "mergeStatus": "can_be_merged",
        "draft": false
      }
    ],
    "todos": []
  },
  "github": {
    "recentIssues": [],
    "prsAwaitingFeedback": [
      {
        "number": 15,
        "title": "Fix rendering bug",
        "url": "https://github.com/AcademySoftwareFoundation/dna/pull/15",
        "author": "contributor",
        "comments": []
      }
    ]
  }
}
```

## Adding New Data Sources

1. Create a new file in `sources/` (e.g., `sources/slack.ts`)
2. Define the data interface in `types.ts`
3. Implement a `fetchSlackBrief(): Promise<SlackBrief>` function
4. Import and call the function in `index.ts`
5. Add the result to the `DailyBrief` object

Example:

```typescript
// sources/slack.ts
import type { SlackBrief } from '../types.js';

export async function fetchSlackBrief(): Promise<SlackBrief> {
  // Implementation
}
```

```typescript
// In index.ts, add to the Promise.all:
const [jira, gitlab, github, slack] = await Promise.all([
  fetchJiraBrief(),
  fetchGitLabBrief(),
  fetchGitHubBrief(),
  fetchSlackBrief(),
]);
```

## Error Handling

Each data source handles errors independently. If one source fails, the others will still be fetched and included in the report. Failed sources will include an `error` field with the error message.

## License

Private use only.
