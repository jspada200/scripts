import 'dotenv/config';
import type { DailyBrief, JiraBrief, GitLabBrief, GitHubBrief } from './types.js';
import { sources } from './config.js';
import { sendBriefEmail } from './email.js';
import { uploadBriefToDrive } from './gdrive.js';

type OutputMode = 'email' | 'gdrive' | 'console';

function parseArgs(): { mode: OutputMode } {
  const args = process.argv.slice(2);
  
  if (args.includes('--gdrive') || args.includes('-g')) {
    return { mode: 'gdrive' };
  }
  if (args.includes('--dry-run') || args.includes('-d')) {
    return { mode: 'console' };
  }
  return { mode: 'email' };
}

function printBrief(brief: DailyBrief): void {
  console.log('\n' + '='.repeat(60));
  console.log('DAILY BRIEF');
  console.log('='.repeat(60));
  console.log(`Generated: ${new Date(brief.generatedAt).toLocaleString()}`);
  console.log('='.repeat(60));

  // Jira Section
  console.log('\n📋 JIRA - ' + brief.jira.sprintName);
  console.log('-'.repeat(40));
  
  if (brief.jira.error) {
    console.log(`  ❌ Error: ${brief.jira.error}`);
  } else {
    if (brief.jira.sprintTickets.length > 0) {
      console.log('  Sprint Tickets:');
      for (const ticket of brief.jira.sprintTickets) {
        console.log(`    • ${ticket.key}: ${ticket.summary}`);
        console.log(`      Status: ${ticket.status} | Priority: ${ticket.priority}`);
      }
    } else {
      console.log('  No tickets in current sprint.');
    }

    if (brief.jira.notifications.length > 0) {
      console.log('\n  Notifications:');
      for (const notification of brief.jira.notifications) {
        console.log(`    • ${notification.title}: ${notification.message}`);
      }
    }
  }

  // GitLab Section
  console.log('\n🦊 GITLAB');
  console.log('-'.repeat(40));
  
  if (brief.gitlab.error) {
    console.log(`  ❌ Error: ${brief.gitlab.error}`);
  } else {
    if (brief.gitlab.mergeRequests.length > 0) {
      console.log('  Your Merge Requests:');
      for (const mr of brief.gitlab.mergeRequests) {
        const draft = mr.draft ? ' [Draft]' : '';
        console.log(`    • !${mr.iid}: ${mr.title}${draft}`);
        console.log(`      ${mr.sourceBranch} → ${mr.targetBranch} | ${mr.mergeStatus}`);
      }
    } else {
      console.log('  No open merge requests.');
    }

    if (brief.gitlab.todos.length > 0) {
      console.log('\n  To-Do Items:');
      for (const todo of brief.gitlab.todos) {
        console.log(`    • ${todo.targetTitle}`);
        console.log(`      Action: ${todo.actionName} | Project: ${todo.projectName}`);
      }
    } else {
      console.log('  No pending to-do items.');
    }
  }

  // GitHub Section
  console.log('\n🐙 GITHUB - AcademySoftwareFoundation/dna');
  console.log('-'.repeat(40));
  
  if (brief.github.error) {
    console.log(`  ❌ Error: ${brief.github.error}`);
  } else {
    if (brief.github.recentIssues.length > 0) {
      console.log('  Issues Opened (Last 24 Hours):');
      for (const issue of brief.github.recentIssues) {
        const labels = issue.labels.length > 0 ? ` [${issue.labels.join(', ')}]` : '';
        console.log(`    • #${issue.number}: ${issue.title}${labels}`);
        console.log(`      By: ${issue.author} | State: ${issue.state}`);
      }
    } else {
      console.log('  No new issues in the last 24 hours.');
    }

    if (brief.github.prsAwaitingFeedback.length > 0) {
      console.log('\n  Open Pull Requests:');
      for (const pr of brief.github.prsAwaitingFeedback) {
        const draft = pr.draft ? ' [Draft]' : '';
        console.log(`    • #${pr.number}: ${pr.title}${draft}`);
        console.log(`      By: ${pr.author} | Updated: ${new Date(pr.updatedAt).toLocaleDateString()}`);
        
        if (pr.comments.length > 0) {
          console.log('      Recent comments:');
          for (const comment of pr.comments.slice(0, 2)) {
            const truncated = comment.body.length > 100 
              ? comment.body.substring(0, 100) + '...' 
              : comment.body;
            console.log(`        - ${comment.author}: ${truncated.replace(/\n/g, ' ')}`);
          }
        }
      }
    } else {
      console.log('  No open pull requests.');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('END OF BRIEF');
  console.log('='.repeat(60) + '\n');

  // Also output raw JSON
  console.log('\n📄 RAW JSON OUTPUT:');
  console.log(JSON.stringify(brief, null, 2));
}

async function fetchSource<T>(
  name: string,
  enabled: boolean,
  fetch: () => Promise<T>,
  emptyState: T
): Promise<T> {
  if (!enabled) {
    console.log(`  ⏭ ${name} (disabled)`);
    return emptyState;
  }
  
  const result = await fetch();
  console.log(`  ✓ ${name} data fetched`);
  return result;
}

async function main(): Promise<void> {
  const { mode } = parseArgs();

  const modeLabels: Record<OutputMode, string> = {
    email: 'EMAIL (will send email)',
    gdrive: 'GOOGLE DRIVE (will upload file)',
    console: 'CONSOLE (dry run)',
  };

  console.log('🚀 Starting Daily Brief generation...');
  console.log(`Mode: ${modeLabels[mode]}\n`);

  // Show enabled sources
  const enabledSources = Object.entries(sources)
    .filter(([_, config]) => config.enabled)
    .map(([_, config]) => config.name);
  const disabledSources = Object.entries(sources)
    .filter(([_, config]) => !config.enabled)
    .map(([_, config]) => config.name);

  console.log('Enabled sources:', enabledSources.join(', ') || 'none');
  if (disabledSources.length > 0) {
    console.log('Disabled sources:', disabledSources.join(', '));
  }
  console.log('\nFetching data from sources...');

  // Fetch all data sources in parallel
  const [jira, gitlab, github] = await Promise.all([
    fetchSource<JiraBrief>(
      sources.jira.name,
      sources.jira.enabled,
      sources.jira.fetch,
      sources.jira.emptyState
    ),
    fetchSource<GitLabBrief>(
      sources.gitlab.name,
      sources.gitlab.enabled,
      sources.gitlab.fetch,
      sources.gitlab.emptyState
    ),
    fetchSource<GitHubBrief>(
      sources.github.name,
      sources.github.enabled,
      sources.github.fetch,
      sources.github.emptyState
    ),
  ]);

  // Combine into daily brief
  const brief: DailyBrief = {
    generatedAt: new Date().toISOString(),
    jira,
    gitlab,
    github,
  };

  if (mode === 'console') {
    printBrief(brief);
  } else if (mode === 'gdrive') {
    try {
      await uploadBriefToDrive(brief);
      console.log('\n✅ Daily brief uploaded to Google Drive!');
    } catch (error) {
      console.error('\n❌ Failed to upload to Google Drive:', error instanceof Error ? error.message : error);
      console.log('\nFalling back to console output:');
      printBrief(brief);
      process.exit(1);
    }
  } else {
    try {
      await sendBriefEmail(brief);
      console.log('\n✅ Daily brief sent via email!');
    } catch (error) {
      console.error('\n❌ Failed to send email:', error instanceof Error ? error.message : error);
      console.log('\nFalling back to console output:');
      printBrief(brief);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
