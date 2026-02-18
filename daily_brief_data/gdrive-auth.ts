import 'dotenv/config';
import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function getAuthUrl(): Promise<{ oauth2Client: any; authUrl: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env\n\n' +
      'To set up OAuth2:\n' +
      '1. Go to https://console.cloud.google.com/apis/credentials\n' +
      '2. Create OAuth 2.0 Client ID (Desktop app type)\n' +
      '3. Download the credentials and add to .env:\n' +
      '   GOOGLE_CLIENT_ID=your-client-id\n' +
      '   GOOGLE_CLIENT_SECRET=your-client-secret'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/callback'
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  return { oauth2Client, authUrl };
}

async function waitForCallback(oauth2Client: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const queryParams = new url.URL(req.url!, 'http://localhost:3000').searchParams;
        const code = queryParams.get('code');

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization successful!</h1><p>You can close this window.</p>');
          server.close();
          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Error</h1><p>No authorization code received.</p>');
        }
      } catch (error) {
        reject(error);
      }
    });

    server.listen(3000, () => {
      console.log('Waiting for authorization on http://localhost:3000/callback ...');
    });

    server.on('error', reject);
  });
}

async function main() {
  console.log('Google Drive OAuth2 Setup\n');
  console.log('='.repeat(50));

  try {
    const { oauth2Client, authUrl } = await getAuthUrl();

    console.log('\n1. Open this URL in your browser:\n');
    console.log(authUrl);
    console.log('\n2. Log in and grant access to Google Drive');
    console.log('3. You will be redirected back here automatically\n');

    const code = await waitForCallback(oauth2Client);

    console.log('\nExchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error('\nError: No refresh token received.');
      console.log('This can happen if you have already authorized this app.');
      console.log('Go to https://myaccount.google.com/permissions and remove access,');
      console.log('then run this script again.');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(50));
    console.log('SUCCESS! Add this to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n' + '='.repeat(50));

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
