import { Queue, QueueEvents, Worker, Job, JobsOptions } from 'bullmq';
import { bullmqRedis } from './redis';
import { prisma } from '../database/client';
import { createLogger, logError, logInfo, logSuccess } from '../utils/logger';

const logger = createLogger('QUEUE');

// Job types and data interfaces
export interface ScrapingJobData {
  tenantId: string;
  sourcePortal: string;
  triggeredBy: string;
  options?: {
    maxPages?: number;
    startDate?: string;
    endDate?: string;
    categories?: string[];
    forceRefresh?: boolean;
  };
  metadata?: Record<string, any>;
}

export interface TenderProcessingJobData {
  tenderId: string;
  tenantId: string;
  action: 'validate' | 'categorize' | 'analyze' | 'notify';
  triggeredBy: string;
  options?: Record<string, any>;
}

export interface NotificationJobData {
  userId?: string;
  tenantId: string;
  type: 'tender_update' | 'deadline_reminder' | 'scraping_complete' | 'system_alert';
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface DocumentProcessingJobData {
  documentId: string;
  tenantId: string;
  action: 'ocr' | 'parse' | 'analyze' | 'extract';
  triggeredBy: string;
  options?: Record<string, any>;
}

// Queue names
export const QUEUE_NAMES = {
  SCRAPING: 'tender-scraping',
  PROCESSING: 'tender-processing',
  NOTIFICATIONS: 'notifications',
  DOCUMENTS: 'document-processing',
  CLEANUP: 'data-cleanup',
} as const;

// Queue configurations
const defaultQueueConfig = {
  connection: bullmqRedis,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  } as JobsOptions,
};

// Create queues
export const scrapingQueue = new Queue<ScrapingJobData>(QUEUE_NAMES.SCRAPING, {
  ...defaultQueueConfig,
  defaultJobOptions: {
    ...defaultQueueConfig.defaultJobOptions,
    attempts: 2, // Scraping jobs are expensive, fewer retries
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export const processingQueue = new Queue<TenderProcessingJobData>(QUEUE_NAMES.PROCESSING, {
  ...defaultQueueConfig,
  defaultJobOptions: {
    ...defaultQueueConfig.defaultJobOptions,
    attempts: 5, // Processing can be retried more often
  },
});

export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATIONS, {
  ...defaultQueueConfig,
  defaultJobOptions: {
    ...defaultQueueConfig.defaultJobOptions,
    attempts: 3,
    delay: 1000, // Small delay for batching
  },
});

export const documentQueue = new Queue<DocumentProcessingJobData>(QUEUE_NAMES.DOCUMENTS, {
  ...defaultQueueConfig,
  defaultJobOptions: {
    ...defaultQueueConfig.defaultJobOptions,
    attempts: 2, // Document processing can be expensive
  },
});

export const cleanupQueue = new Queue(QUEUE_NAMES.CLEANUP, {
  ...defaultQueueConfig,
  defaultJobOptions: {
    ...defaultQueueConfig.defaultJobOptions,
    attempts: 1, // Cleanup jobs should not retry
    removeOnComplete: 10,
  },
});

// Queue events for monitoring
export const queueEvents = {
  scraping: new QueueEvents(QUEUE_NAMES.SCRAPING, { connection: bullmqRedis }),
  processing: new QueueEvents(QUEUE_NAMES.PROCESSING, { connection: bullmqRedis }),
  notifications: new QueueEvents(QUEUE_NAMES.NOTIFICATIONS, { connection: bullmqRedis }),
  documents: new QueueEvents(QUEUE_NAMES.DOCUMENTS, { connection: bullmqRedis }),
  cleanup: new QueueEvents(QUEUE_NAMES.CLEANUP, { connection: bullmqRedis }),
};

// Job scheduling utilities
export class JobScheduler {
  // Schedule scraping job
  static async scheduleScraping(
    data: ScrapingJobData,
    options?: {
      delay?: number;
      priority?: number;
      repeat?: { cron?: string; every?: number };
    }
  ): Promise<Job<ScrapingJobData>> {
    const jobOptions: JobsOptions = {};
    
    if (options?.delay) jobOptions.delay = options.delay;
    if (options?.priority) jobOptions.priority = options.priority;
    if (options?.repeat) jobOptions.repeat = options.repeat;

    // Create scraping log entry
    const scrapingLog = await prisma.scrapingLog.create({
      data: {
        tenantId: data.tenantId,
        sourcePortal: data.sourcePortal,
        triggeredBy: data.triggeredBy,
        status: 'PENDING',
        metadata: data.metadata || {},
      },
    });

    // Add scraping log ID to job data
    const jobData = {
      ...data,
      scrapingLogId: scrapingLog.id,
    };

    return await scrapingQueue.add(`scraping-${data.sourcePortal}-${Date.now()}`, jobData, jobOptions);
  }

  // Schedule tender processing
  static async scheduleProcessing(
    data: TenderProcessingJobData,
    options?: { delay?: number; priority?: number }
  ): Promise<Job<TenderProcessingJobData>> {
    const jobOptions: JobsOptions = {};
    
    if (options?.delay) jobOptions.delay = options.delay;
    if (options?.priority) jobOptions.priority = options.priority;

    return await processingQueue.add(
      `processing-${data.action}-${data.tenderId}`,
      data,
      jobOptions
    );
  }

  // Schedule notification
  static async scheduleNotification(
    data: NotificationJobData,
    options?: { delay?: number; priority?: number }
  ): Promise<Job<NotificationJobData>> {
    const jobOptions: JobsOptions = {};
    
    if (options?.delay) jobOptions.delay = options.delay;
    
    // Set priority based on notification type and data priority
    const priorityMap = { urgent: 1, high: 2, normal: 5, low: 10 };
    jobOptions.priority = options?.priority || priorityMap[data.priority || 'normal'];

    return await notificationQueue.add(
      `notification-${data.type}-${Date.now()}`,
      data,
      jobOptions
    );
  }

  // Schedule document processing
  static async scheduleDocumentProcessing(
    data: DocumentProcessingJobData,
    options?: { delay?: number; priority?: number }
  ): Promise<Job<DocumentProcessingJobData>> {
    const jobOptions: JobsOptions = {};
    
    if (options?.delay) jobOptions.delay = options.delay;
    if (options?.priority) jobOptions.priority = options.priority;

    return await documentQueue.add(
      `document-${data.action}-${data.documentId}`,
      data,
      jobOptions
    );
  }

  // Schedule cleanup job
  static async scheduleCleanup(
    type: 'audit_logs' | 'old_tenders' | 'temp_files' | 'failed_jobs',
    data: Record<string, any> = {},
    delay: number = 0
  ): Promise<Job> {
    return await cleanupQueue.add(
      `cleanup-${type}-${Date.now()}`,
      { type, ...data },
      { delay }
    );
  }
}

// Job monitoring and statistics
export class JobMonitor {
  static async getQueueStats(queueName: keyof typeof QUEUE_NAMES): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const queue = this.getQueue(queueName);
    
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  static async getAllQueueStats(): Promise<Record<string, any>> {
    const stats = {};
    
    for (const queueName of Object.keys(QUEUE_NAMES) as Array<keyof typeof QUEUE_NAMES>) {
      stats[queueName] = await this.getQueueStats(queueName);
    }

    return stats;
  }

  static async getFailedJobs(queueName: keyof typeof QUEUE_NAMES, limit: number = 10): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    return await queue.getFailed(0, limit - 1);
  }

  static async retryFailedJobs(queueName: keyof typeof QUEUE_NAMES, limit: number = 10): Promise<number> {
    const failedJobs = await this.getFailedJobs(queueName, limit);
    let retriedCount = 0;

    for (const job of failedJobs) {
      try {
        await job.retry();
        retriedCount++;
      } catch (error) {
        logError('RETRY', `Failed to retry job ${job.id}`, error as Error);
      }
    }

    return retriedCount;
  }

  static async cleanQueue(queueName: keyof typeof QUEUE_NAMES, grace: number = 5000): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, 100, 'completed');
    await queue.clean(grace, 50, 'failed');
  }

  private static getQueue(queueName: keyof typeof QUEUE_NAMES): Queue {
    const queueMap = {
      SCRAPING: scrapingQueue,
      PROCESSING: processingQueue,
      NOTIFICATIONS: notificationQueue,
      DOCUMENTS: documentQueue,
      CLEANUP: cleanupQueue,
    };

    return queueMap[queueName];
  }
}

// Priority management
export const PRIORITIES = {
  URGENT: 1,
  HIGH: 2,
  NORMAL: 5,
  LOW: 10,
} as const;

// Cron expressions for recurring jobs
export const CRON_PATTERNS = {
  EVERY_MINUTE: '*/1 * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_15_MINUTES: '*/15 * * * *',
  EVERY_30_MINUTES: '*/30 * * * *',
  HOURLY: '0 * * * *',
  DAILY: '0 0 * * *',
  WEEKLY: '0 0 * * 0',
  MONTHLY: '0 0 1 * *',
} as const;

// Setup recurring jobs
export async function setupRecurringJobs(): Promise<void> {
  try {
    logInfo('SETUP', 'Setting up recurring jobs...');

    // Daily cleanup job
    await cleanupQueue.add(
      'daily-cleanup',
      { type: 'daily_maintenance' },
      {
        repeat: { cron: CRON_PATTERNS.DAILY },
        removeOnComplete: 5,
        removeOnFail: 1,
      }
    );

    // Weekly audit log cleanup
    await cleanupQueue.add(
      'weekly-audit-cleanup',
      { type: 'audit_logs', retentionDays: 2555 }, // 7 years
      {
        repeat: { cron: CRON_PATTERNS.WEEKLY },
        removeOnComplete: 5,
        removeOnFail: 1,
      }
    );

    // Failed job retry (every 15 minutes)
    await cleanupQueue.add(
      'retry-failed-jobs',
      { type: 'retry_failed' },
      {
        repeat: { cron: CRON_PATTERNS.EVERY_15_MINUTES },
        removeOnComplete: 10,
        removeOnFail: 2,
      }
    );

    logSuccess('SETUP', 'Recurring jobs set up successfully');
  } catch (error) {
    logError('SETUP', 'Failed to set up recurring jobs', error as Error);
  }
}

// Health check for queues
export async function checkQueuesHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  queues: Record<string, { status: string; stats?: any; error?: string }>;
}> {
  const results: Record<string, { status: string; stats?: any; error?: string }> = {};
  let overallHealthy = true;

  for (const [key, queueName] of Object.entries(QUEUE_NAMES)) {
    try {
      const stats = await JobMonitor.getQueueStats(key as keyof typeof QUEUE_NAMES);
      results[queueName] = {
        status: 'healthy',
        stats,
      };
    } catch (error) {
      results[queueName] = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      overallHealthy = false;
    }
  }

  return {
    status: overallHealthy ? 'healthy' : 'unhealthy',
    queues: results,
  };
}

// Graceful shutdown
export async function shutdownQueues(): Promise<void> {
  try {
    logInfo('SHUTDOWN', 'Shutting down job queues...');

    // Close all queues
    await Promise.all([
      scrapingQueue.close(),
      processingQueue.close(),
      notificationQueue.close(),
      documentQueue.close(),
      cleanupQueue.close(),
    ]);

    // Close queue events
    await Promise.all([
      queueEvents.scraping.close(),
      queueEvents.processing.close(),
      queueEvents.notifications.close(),
      queueEvents.documents.close(),
      queueEvents.cleanup.close(),
    ]);

    logSuccess('SHUTDOWN', 'Job queues shut down successfully');
  } catch (error) {
    logError('SHUTDOWN', 'Error shutting down job queues', error as Error);
  }
}

// Queues are already exported individually above

export default {
  queues: {
    scraping: scrapingQueue,
    processing: processingQueue,
    notifications: notificationQueue,
    documents: documentQueue,
    cleanup: cleanupQueue,
  },
  scheduler: JobScheduler,
  monitor: JobMonitor,
  priorities: PRIORITIES,
  cron: CRON_PATTERNS,
};