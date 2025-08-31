import { Job } from 'bullmq';
import { createTransporter } from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { AlertDispatchJobData } from '../queues';

const prisma = new PrismaClient();

/**
 * Alert Dispatch Job Processor
 * 
 * Handles sending notifications via:
 * - Email notifications
 * - Webhook calls
 * - Push notifications (placeholder)
 */
export async function processAlertDispatch(
  job: Job<AlertDispatchJobData>
): Promise<{ success: boolean; error?: string }> {
  const { type, recipients, subject, message, data = {}, priority = 'normal' } = job.data;

  try {
    job.log(`Processing ${type} alert for ${recipients.length} recipients`);
    
    await job.updateProgress(10);

    switch (type) {
      case 'email':
        await sendEmailAlert(job, { recipients, subject, message, data });
        break;
        
      case 'webhook':
        await sendWebhookAlert(job, { recipients, message, data });
        break;
        
      case 'push':
        await sendPushAlert(job, { recipients, message, data });
        break;
        
      default:
        throw new Error(`Unknown alert type: ${type}`);
    }

    await job.updateProgress(100);
    job.log(`Alert dispatch completed successfully`);
    
    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`Alert dispatch failed: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send email alert
 */
async function sendEmailAlert(
  job: Job,
  options: {
    recipients: string[];
    subject?: string;
    message: string;
    data: Record<string, any>;
  }
): Promise<void> {
  const { recipients, subject, message, data } = options;

  // Create email transporter
  const transporter = createTransporter({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // Send emails in batches to avoid overwhelming SMTP server
  const batchSize = 10;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    
    const promises = batch.map(async (recipient) => {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@tenderflow.com',
          to: recipient,
          subject: subject || 'TenderFlow Notification',
          html: formatEmailMessage(message, data),
          text: message,
        });
        
        job.log(`Email sent to ${recipient}`);
        
      } catch (error) {
        job.log(`Failed to send email to ${recipient}: ${error}`);
        throw error;
      }
    });

    await Promise.all(promises);
    
    // Update progress
    const progress = Math.min(90, (i + batchSize) / recipients.length * 80 + 10);
    await job.updateProgress(progress);
    
    // Small delay between batches
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Send webhook alert
 */
async function sendWebhookAlert(
  job: Job,
  options: {
    recipients: string[]; // webhook URLs
    message: string;
    data: Record<string, any>;
  }
): Promise<void> {
  const { recipients, message, data } = options;

  const payload = {
    message,
    data,
    timestamp: new Date().toISOString(),
    source: 'tenderflow',
  };

  for (const webhookUrl of recipients) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TenderFlow-Webhook/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      job.log(`Webhook sent to ${webhookUrl}`);
      
    } catch (error) {
      job.log(`Failed to send webhook to ${webhookUrl}: ${error}`);
      throw error;
    }
  }
}

/**
 * Send push notification (placeholder)
 */
async function sendPushAlert(
  job: Job,
  options: {
    recipients: string[]; // push tokens/user IDs
    message: string;
    data: Record<string, any>;
  }
): Promise<void> {
  const { recipients, message, data } = options;

  // This would integrate with push notification services like:
  // - Firebase Cloud Messaging
  // - Apple Push Notification service
  // - OneSignal
  // - Pusher
  
  for (const recipient of recipients) {
    try {
      // Placeholder implementation
      job.log(`Push notification would be sent to ${recipient}: ${message}`);
      
      // TODO: Integrate with actual push service
      
    } catch (error) {
      job.log(`Failed to send push to ${recipient}: ${error}`);
      throw error;
    }
  }
}

/**
 * Format email message with data
 */
function formatEmailMessage(message: string, data: Record<string, any>): string {
  // Simple template replacement
  let formatted = message;
  
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    formatted = formatted.replace(new RegExp(placeholder, 'g'), String(value));
  }
  
  // Basic HTML formatting
  formatted = formatted
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  return `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="padding: 20px;">
          ${formatted}
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
          This email was sent by TenderFlow. If you no longer wish to receive these notifications, please contact your administrator.
        </div>
      </body>
    </html>
  `;
}

/**
 * Create notification records for tracking
 */
export async function createNotificationRecords(
  job: Job<AlertDispatchJobData>
): Promise<void> {
  const { type, recipients, subject, message, data = {} } = job.data;

  try {
    // Find users by email/identifier
    const users = await prisma.user.findMany({
      where: {
        email: { in: recipients },
      },
    });

    // Create notification records
    const notifications = users.map(user => ({
      userId: user.id,
      tenderId: data.tenderId || null,
      type: 'SYSTEM_ALERT' as const,
      title: subject || 'TenderFlow Notification',
      message,
      data,
    }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({
        data: notifications,
      });
      
      job.log(`Created ${notifications.length} notification records`);
    }

  } catch (error) {
    job.log(`Failed to create notification records: ${error}`);
    // Don't throw - this is not critical for alert dispatch
  }
}