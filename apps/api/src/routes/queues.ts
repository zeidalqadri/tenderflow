import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JobMonitor, JobScheduler, QUEUE_NAMES, PRIORITIES } from '../services/queue';
import { checkQueuesHealth } from '../services/queue';
import { getRedisStats, checkRedisHealth } from '../services/redis';
import { z } from 'zod';
import { createLogger, logInfo, logError } from '../utils/logger';

const logger = createLogger('QUEUES_ROUTES');

// Schema definitions
const TriggerScrapingSchema = z.object({
  sourcePortal: z.string(),
  maxPages: z.number().min(1).max(100).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  categories: z.array(z.string()).optional(),
  forceRefresh: z.boolean().optional(),
});

const TriggerProcessingSchema = z.object({
  tenderId: z.string(),
  action: z.enum(['validate', 'categorize', 'analyze', 'notify']),
  options: z.record(z.any()).optional(),
});

const TriggerNotificationSchema = z.object({
  userId: z.string().optional(),
  type: z.enum(['tender_update', 'deadline_reminder', 'scraping_complete', 'system_alert']),
  data: z.record(z.any()),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export default async function queueRoutes(fastify: FastifyInstance) {
  // Get queue statistics
  fastify.get('/api/v1/queues/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await JobMonitor.getAllQueueStats();
      const health = await checkQueuesHealth();
      const redisHealth = await checkRedisHealth();
      const redisStats = await getRedisStats();
      
      return reply.send({
        queues: stats,
        health: health.status,
        redis: {
          status: redisHealth.status,
          details: redisHealth.details,
          stats: redisStats,
        },
      });
    } catch (error) {
      logError('STATS', 'Failed to get queue statistics', error as Error);
      return reply.status(500).send({
        error: 'Failed to get queue statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get specific queue details
  fastify.get('/api/v1/queues/:queueName', async (request: FastifyRequest<{
    Params: { queueName: keyof typeof QUEUE_NAMES }
  }>, reply: FastifyReply) => {
    try {
      const { queueName } = request.params;
      
      if (!QUEUE_NAMES[queueName]) {
        return reply.status(404).send({
          error: 'Queue not found',
          available: Object.keys(QUEUE_NAMES),
        });
      }
      
      const stats = await JobMonitor.getQueueStats(queueName);
      const failedJobs = await JobMonitor.getFailedJobs(queueName, 10);
      
      return reply.send({
        name: queueName,
        stats,
        failedJobs: failedJobs.map(job => ({
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
          stacktrace: job.stacktrace,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        })),
      });
    } catch (error) {
      logError('DETAILS', 'Failed to get queue details', error as Error);
      return reply.status(500).send({
        error: 'Failed to get queue details',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Retry failed jobs
  fastify.post('/api/v1/queues/:queueName/retry', async (request: FastifyRequest<{
    Params: { queueName: keyof typeof QUEUE_NAMES }
  }>, reply: FastifyReply) => {
    try {
      const { queueName } = request.params;
      
      if (!QUEUE_NAMES[queueName]) {
        return reply.status(404).send({
          error: 'Queue not found',
          available: Object.keys(QUEUE_NAMES),
        });
      }
      
      const retriedCount = await JobMonitor.retryFailedJobs(queueName, 10);
      
      logInfo('RETRY', `Retried ${retriedCount} failed jobs in ${queueName}`);
      
      return reply.send({
        queue: queueName,
        retriedJobs: retriedCount,
      });
    } catch (error) {
      logError('RETRY', 'Failed to retry jobs', error as Error);
      return reply.status(500).send({
        error: 'Failed to retry jobs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Clean queue
  fastify.delete('/api/v1/queues/:queueName/clean', async (request: FastifyRequest<{
    Params: { queueName: keyof typeof QUEUE_NAMES }
  }>, reply: FastifyReply) => {
    try {
      const { queueName } = request.params;
      
      if (!QUEUE_NAMES[queueName]) {
        return reply.status(404).send({
          error: 'Queue not found',
          available: Object.keys(QUEUE_NAMES),
        });
      }
      
      await JobMonitor.cleanQueue(queueName, 5000);
      
      logInfo('CLEAN', `Cleaned queue ${queueName}`);
      
      return reply.send({
        queue: queueName,
        status: 'cleaned',
      });
    } catch (error) {
      logError('CLEAN', 'Failed to clean queue', error as Error);
      return reply.status(500).send({
        error: 'Failed to clean queue',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Trigger scraping job
  fastify.post('/api/v1/queues/trigger/scraping', async (request: FastifyRequest<{
    Body: z.infer<typeof TriggerScrapingSchema>
  }>, reply: FastifyReply) => {
    try {
      const body = TriggerScrapingSchema.parse(request.body);
      const user = (request as any).user;
      const tenantId = user?.tenantId || 'dev-tenant-001';
      const triggeredBy = user?.id || 'dev-user-001';
      
      const job = await JobScheduler.scheduleScraping({
        tenantId,
        sourcePortal: body.sourcePortal,
        triggeredBy,
        options: {
          maxPages: body.maxPages,
          startDate: body.startDate,
          endDate: body.endDate,
          categories: body.categories,
          forceRefresh: body.forceRefresh,
        },
      });
      
      logInfo('TRIGGER', `Scraping job scheduled: ${job.id}`);
      
      return reply.send({
        jobId: job.id,
        status: 'scheduled',
        queue: QUEUE_NAMES.SCRAPING,
      });
    } catch (error) {
      logError('TRIGGER', 'Failed to schedule scraping job', error as Error);
      return reply.status(500).send({
        error: 'Failed to schedule scraping job',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Trigger processing job
  fastify.post('/api/v1/queues/trigger/processing', async (request: FastifyRequest<{
    Body: z.infer<typeof TriggerProcessingSchema>
  }>, reply: FastifyReply) => {
    try {
      const body = TriggerProcessingSchema.parse(request.body);
      const user = (request as any).user;
      const tenantId = user?.tenantId || 'dev-tenant-001';
      const triggeredBy = user?.id || 'dev-user-001';
      
      const job = await JobScheduler.scheduleProcessing({
        tenderId: body.tenderId,
        tenantId,
        action: body.action,
        triggeredBy,
        options: body.options,
      });
      
      logInfo('TRIGGER', `Processing job scheduled: ${job.id}`);
      
      return reply.send({
        jobId: job.id,
        status: 'scheduled',
        queue: QUEUE_NAMES.PROCESSING,
      });
    } catch (error) {
      logError('TRIGGER', 'Failed to schedule processing job', error as Error);
      return reply.status(500).send({
        error: 'Failed to schedule processing job',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Trigger notification
  fastify.post('/api/v1/queues/trigger/notification', async (request: FastifyRequest<{
    Body: z.infer<typeof TriggerNotificationSchema>
  }>, reply: FastifyReply) => {
    try {
      const body = TriggerNotificationSchema.parse(request.body);
      const user = (request as any).user;
      const tenantId = user?.tenantId || 'dev-tenant-001';
      
      const job = await JobScheduler.scheduleNotification({
        userId: body.userId || user?.id,
        tenantId,
        type: body.type,
        data: body.data,
        priority: body.priority,
      });
      
      logInfo('TRIGGER', `Notification job scheduled: ${job.id}`);
      
      return reply.send({
        jobId: job.id,
        status: 'scheduled',
        queue: QUEUE_NAMES.NOTIFICATIONS,
      });
    } catch (error) {
      logError('TRIGGER', 'Failed to schedule notification job', error as Error);
      return reply.status(500).send({
        error: 'Failed to schedule notification job',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Health check endpoint
  fastify.get('/api/v1/queues/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await checkQueuesHealth();
      const redisHealth = await checkRedisHealth();
      
      const overallHealthy = health.status === 'healthy' && redisHealth.status === 'healthy';
      
      return reply
        .status(overallHealthy ? 200 : 503)
        .send({
          status: overallHealthy ? 'healthy' : 'unhealthy',
          queues: health.queues,
          redis: redisHealth,
        });
    } catch (error) {
      logError('HEALTH', 'Failed to check queue health', error as Error);
      return reply.status(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}