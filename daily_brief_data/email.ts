import nodemailer from 'nodemailer';
import type { DailyBrief } from './types.js';

interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  recipient: string;
}

function getEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;
  const recipient = process.env.EMAIL_RECIPIENT;

  if (!host || !port || !user || !pass || !from || !recipient) {
    throw new Error(
      'Missing email configuration. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, and EMAIL_RECIPIENT in .env'
    );
  }

  return {
    host,
    port: parseInt(port, 10),
    user,
    pass,
    from,
    recipient,
  };
}

export async function sendBriefEmail(brief: DailyBrief): Promise<void> {
  const config = getEmailConfig();

  const transportConfig: nodemailer.TransportOptions = {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    tls: {
      rejectUnauthorized: false,
    },
  };

  if (config.port !== 25) {
    (transportConfig as any).auth = {
      user: config.user,
      pass: config.pass,
    };
  }

  const transporter = nodemailer.createTransport(transportConfig);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const jsonContent = JSON.stringify(brief, null, 2);

  const mailOptions = {
    from: config.from,
    to: config.recipient,
    subject: `Daily Brief - ${today}`,
    text: jsonContent,
  };

  await transporter.sendMail(mailOptions);
  console.log(`Email sent successfully to ${config.recipient}`);
}
