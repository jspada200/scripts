import { google } from 'googleapis';
import type { DailyBrief } from './types.js';
import { sources } from './config.js';

interface DriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
}

function getDriveConfig(): DriveConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new Error(
      'Missing Google Drive configuration. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ' +
      'GOOGLE_REFRESH_TOKEN, and GOOGLE_DRIVE_FOLDER_ID in .env\n\n' +
      'Run "npm run gdrive:auth" to get the refresh token.'
    );
  }

  return { clientId, clientSecret, refreshToken, folderId };
}

export async function uploadBriefToDrive(brief: DailyBrief): Promise<string> {
  const config = getDriveConfig();

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  
  const enabledSources = Object.entries(sources)
    .filter(([_, config]) => config.enabled)
    .map(([_, config]) => config.name.toLowerCase())
    .join('-');

  const filename = `${dateStr}_${enabledSources}.json`;

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [config.folderId],
    },
    media: {
      mimeType: 'application/json',
      body: JSON.stringify(brief, null, 2),
    },
  });

  const fileId = response.data.id || '';
  const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;

  console.log(`File uploaded: ${filename}`);
  console.log(`File ID: ${fileId}`);
  console.log(`URL: ${fileUrl}`);

  return fileId;
}
