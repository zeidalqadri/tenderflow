import { Worker, Job } from 'bullmq';
import { bullmqRedis } from '../services/redis';
import { prisma } from '../database/client';
import { createLogger, logInfo, logError, logSuccess } from '../utils/logger';
import { NotificationJobData, QUEUE_NAMES } from '../services/queue';
import * as nodemailer from 'nodemailer';
import * as twilio from 'twilio';

const logger = createLogger('NOTIFICATION_WORKER');

// Create email transporter only if SMTP is configured
const emailTransporter = process.env.SMTP_USER ? 
  (nodemailer as any).createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  }) : null;

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? (twilio as any)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

export const notificationWorker = new Worker<NotificationJobData>(
  QUEUE_NAMES.NOTIFICATIONS,
  async (job: Job<NotificationJobData>) => {
    const { userId, tenantId, type, data, priority } = job.data;
    
    logInfo('WORKER', `Processing notification ${job.id} - Type: ${type}`);
    
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      
      if (!tenant) {
        throw new Error(`Tenant ${tenantId} not found`);
      }
      
      await job.updateProgress(20);
      
      let recipients: any[] = [];
      
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            notificationPreferences: true,
          },
        });
        if (user) recipients = [user];
      } else {
        recipients = await prisma.user.findMany({
          where: {
            tenantId,
            isActive: true,
            notificationPreferences: {
              some: {
                type,
                enabled: true,
              },
            },
          },
          include: {
            notificationPreferences: true,
          },
        });
      }
      
      await job.updateProgress(40);
      
      const notificationContent = generateNotificationContent(type, data, tenant);
      const sentNotifications: any[] = [];
      
      for (const recipient of recipients) {
        const preferences = recipient.notificationPreferences || [];
        const typePreference = preferences.find((p: any) => p.type === type);
        
        if (!typePreference?.enabled) continue;
        
        const channels = typePreference.channels || ['email', 'inApp'];
        
        for (const channel of channels) {
          try {
            switch (channel) {
              case 'email':
                if (recipient.email) {
                  await sendEmailNotification(
                    recipient.email,
                    notificationContent.subject,
                    notificationContent.body,
                    notificationContent.html
                  );
                  sentNotifications.push({ userId: recipient.id, channel: 'email' });
                }
                break;
                
              case 'sms':
                if (recipient.phone && twilioClient) {
                  await sendSmsNotification(
                    recipient.phone,
                    notificationContent.shortMessage
                  );
                  sentNotifications.push({ userId: recipient.id, channel: 'sms' });
                }
                break;
                
              case 'inApp':
                await createInAppNotification(
                  recipient.id,
                  tenantId,
                  type,
                  notificationContent.title,
                  notificationContent.body,
                  data,
                  priority
                );
                sentNotifications.push({ userId: recipient.id, channel: 'inApp' });
                break;
                
              case 'webhook':
                if (tenant.webhookUrl) {
                  await sendWebhookNotification(
                    tenant.webhookUrl,
                    type,
                    data,
                    tenant.id
                  );
                  sentNotifications.push({ userId: recipient.id, channel: 'webhook' });
                }
                break;
            }
          } catch (error) {
            logError('CHANNEL', `Failed to send ${channel} notification to ${recipient.id}`, error as Error);
          }
        }
      }
      
      await job.updateProgress(80);
      
      await prisma.notificationLog.create({
        data: {
          type,
          tenantId,
          userId,
          priority: priority || 'normal',
          channels: sentNotifications.map(n => n.channel),
          recipients: sentNotifications.map(n => n.userId),
          metadata: {
            jobId: job.id,
            data,
            sentNotifications,
          },
          sentAt: new Date(),
        },
      });
      
      await job.updateProgress(100);
      
      logSuccess('WORKER', `Notification ${job.id} sent to ${sentNotifications.length} recipients`);
      
      return {
        success: true,
        recipientCount: sentNotifications.length,
        channels: [...new Set(sentNotifications.map(n => n.channel))],
      };
      
    } catch (error) {
      logError('WORKER', `Notification job ${job.id} failed`, error as Error);
      throw error;
    }
  },
  {
    connection: bullmqRedis,
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 60000,
    },
  }
);

function generateNotificationContent(type: string, data: any, tenant: any) {
  switch (type) {
    case 'tender_update':
      return {
        subject: `Tender Update: ${data.title}`,
        title: 'Tender Update',
        body: `The tender "${data.title}" has been updated. Status: ${data.status || 'In Progress'}. ${data.deadline ? `Deadline: ${new Date(data.deadline).toLocaleDateString()}` : ''}`,
        html: `
          <h2>Tender Update</h2>
          <p>The tender <strong>${data.title}</strong> has been updated.</p>
          <ul>
            <li>Status: ${data.status || 'In Progress'}</li>
            <li>Priority: ${data.priority || 'Normal'}</li>
            ${data.deadline ? `<li>Deadline: ${new Date(data.deadline).toLocaleDateString()}</li>` : ''}
            ${data.value ? `<li>Value: $${data.value.toLocaleString()}</li>` : ''}
          </ul>
          <p><a href="${process.env.APP_URL}/tenders/${data.tenderId}">View Tender</a></p>
        `,
        shortMessage: `Tender "${data.title}" updated - ${data.status}`,
      };
      
    case 'deadline_reminder':
      return {
        subject: `Deadline Reminder: ${data.title}`,
        title: 'Deadline Approaching',
        body: `The tender "${data.title}" deadline is approaching: ${new Date(data.deadline).toLocaleDateString()}. ${data.daysRemaining} days remaining.`,
        html: `
          <h2>⏰ Deadline Reminder</h2>
          <p>The deadline for tender <strong>${data.title}</strong> is approaching!</p>
          <ul>
            <li>Deadline: ${new Date(data.deadline).toLocaleDateString()}</li>
            <li>Days Remaining: ${data.daysRemaining}</li>
            <li>Status: ${data.status}</li>
          </ul>
          <p><a href="${process.env.APP_URL}/tenders/${data.tenderId}">Take Action</a></p>
        `,
        shortMessage: `${data.daysRemaining} days until "${data.title}" deadline`,
      };
      
    case 'scraping_complete':
      return {
        subject: 'Scraping Job Completed',
        title: 'New Tenders Available',
        body: `Scraping completed successfully. ${data.tendersFound} new tenders found from ${data.sourcePortal}.`,
        html: `
          <h2>✅ Scraping Completed</h2>
          <p>The scraping job has completed successfully.</p>
          <ul>
            <li>Source: ${data.sourcePortal}</li>
            <li>Tenders Found: ${data.tendersFound}</li>
            <li>Duration: ${data.duration}s</li>
          </ul>
          <p><a href="${process.env.APP_URL}/inbox">View New Tenders</a></p>
        `,
        shortMessage: `${data.tendersFound} new tenders found`,
      };
      
    case 'system_alert':
      return {
        subject: `System Alert: ${data.alertType}`,
        title: 'System Alert',
        body: data.message,
        html: `
          <h2>🔔 System Alert</h2>
          <p><strong>Type:</strong> ${data.alertType}</p>
          <p>${data.message}</p>
          ${data.action ? `<p><a href="${process.env.APP_URL}${data.action}">Take Action</a></p>` : ''}
        `,
        shortMessage: data.message,
      };
      
    default:
      return {
        subject: 'TenderFlow Notification',
        title: 'Notification',
        body: JSON.stringify(data),
        html: `<p>${JSON.stringify(data)}</p>`,
        shortMessage: 'You have a new notification',
      };
  }
}

async function sendEmailNotification(to: string, subject: string, text: string, html?: string) {
  if (!emailTransporter) {
    logInfo('EMAIL', 'Email sending skipped - SMTP not configured');
    return;
  }
  
  await emailTransporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html: html || text,
  });
  
  logSuccess('EMAIL', `Email sent to ${to}`);
}

async function sendSmsNotification(to: string, message: string) {
  if (!twilioClient) {
    logInfo('SMS', 'SMS sending skipped - Twilio not configured');
    return;
  }
  
  await twilioClient.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
  
  logSuccess('SMS', `SMS sent to ${to}`);
}

async function createInAppNotification(
  userId: string,
  tenantId: string,
  type: string,
  title: string,
  body: string,
  data: any,
  priority?: string
) {
  await prisma.notification.create({
    data: {
      userId,
      tenantId,
      type,
      title,
      body,
      data,
      priority: priority || 'normal',
      read: false,
    },
  });
  
  logSuccess('IN_APP', `In-app notification created for user ${userId}`);
}

async function sendWebhookNotification(url: string, type: string, data: any, tenantId: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TenderFlow-Event': type,
      'X-TenderFlow-Tenant': tenantId,
    },
    body: JSON.stringify({
      event: type,
      data,
      timestamp: new Date().toISOString(),
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.statusText}`);
  }
  
  logSuccess('WEBHOOK', `Webhook sent to ${url}`);
}

notificationWorker.on('completed', (job) => {
  logSuccess('WORKER', `Job ${job.id} completed successfully`);
});

notificationWorker.on('failed', (job, err) => {
  logError('WORKER', `Job ${job?.id} failed`, err);
});

export default notificationWorker;