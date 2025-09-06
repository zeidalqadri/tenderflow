/**
 * Scraper API routes for managing scraping operations
 */

import { FastifyInstance } from 'fastify';
import { ScraperService } from '../services/scraper/scraper.service';
import { z } from 'zod';
import { toJsonSchema } from '../utils/schema-converter';
import { prisma } from '../database/client';

// Request/Response schemas
const StartScrapingSchema = z.object({
  maxPages: z.number().optional(),
  minValue: z.number().optional(),
  maxDaysLeft: z.number().optional(),
  workers: z.number().min(1).max(32).optional().default(4),
  headless: z.boolean().optional().default(true),
  sourcePortal: z.string().optional().default('zakup.sk.kz')
});

const JobStatusParamsSchema = z.object({
  jobId: z.string()
});

export async function scraperRoutes(fastify: FastifyInstance) {
  // Get WebSocket service from fastify instance if available
  const websocketService = (fastify as any).websocketService;
  const scraperService = new ScraperService(prisma, websocketService);

  // Start scraping job
  fastify.post('/api/scraper/run', {
    schema: {
      body: toJsonSchema(StartScrapingSchema),
      response: {
        200: toJsonSchema(z.object({
          jobId: z.string(),
          status: z.string(),
          message: z.string()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const options = StartScrapingSchema.parse(request.body);
      const tenantId = request.user.tenantId;
      const userId = request.user.id;

      const jobId = await scraperService.startScraping(tenantId, userId, options);

      return {
        jobId,
        status: 'queued',
        message: 'Scraping job started successfully'
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start scraping job';
      reply.code(500);
      return { error: message };
    }
  });

  // Get job status
  fastify.get('/api/scraper/status/:jobId', {
    schema: {
      params: toJsonSchema(JobStatusParamsSchema),
      response: {
        200: toJsonSchema(z.object({
          job: z.any(),
          logs: z.array(z.any()).optional()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const { jobId } = JobStatusParamsSchema.parse(request.params);
      
      const job = scraperService.getJobStatus(jobId);
      if (!job) {
        reply.code(404);
        return { error: 'Job not found' };
      }

      // Get recent scraping logs
      const logs = await prisma.scrapingLog.findMany({
        where: {
          tenantId: request.user.tenantId,
          metadata: {
            path: ['jobId'],
            equals: jobId
          }
        },
        orderBy: { startedAt: 'desc' },
        take: 10
      });

      return { job, logs };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get job status';
      reply.code(500);
      return { error: message };
    }
  });

  // Cancel scraping job
  fastify.post('/api/scraper/cancel/:jobId', {
    schema: {
      params: toJsonSchema(JobStatusParamsSchema),
      response: {
        200: toJsonSchema(z.object({
          success: z.boolean(),
          message: z.string()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const { jobId } = JobStatusParamsSchema.parse(request.params);
      
      const success = await scraperService.cancelJob(jobId);
      
      if (success) {
        return {
          success: true,
          message: 'Job cancelled successfully'
        };
      } else {
        reply.code(404);
        return {
          success: false,
          message: 'Job not found or cannot be cancelled'
        };
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel job';
      reply.code(500);
      return { error: message };
    }
  });

  // Get scraping statistics
  fastify.get('/api/scraper/stats', {
    schema: {
      response: {
        200: toJsonSchema(z.object({
          stats: z.any(),
          transformationStats: z.any()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;
      
      const stats = await scraperService.getScrapingStats(tenantId);
      // Transformer is private, use a method to get transformation stats
      const transformationStats = await prisma.tender.groupBy({
        by: ['category', 'status'],
        where: { tenantId, sourcePortal: 'zakup.sk.kz' },
        _count: true
      });

      return { stats, transformationStats };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get scraping stats';
      reply.code(500);
      return { error: message };
    }
  });

  // Get scraping logs
  fastify.get('/api/scraper/logs', {
    schema: {
      querystring: toJsonSchema(z.object({
        limit: z.string().transform(Number).optional().default(20),
        status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional()
      })),
      response: {
        200: toJsonSchema(z.object({
          logs: z.array(z.any()),
          total: z.number()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const { limit, status } = request.query as any;
      const tenantId = request.user.tenantId;

      const where: any = { tenantId };
      if (status) where.status = status;

      const [logs, total] = await Promise.all([
        prisma.scrapingLog.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          take: limit,
          include: {
            triggeredByUser: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }),
        prisma.scrapingLog.count({ where })
      ]);

      return { logs, total };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get scraping logs';
      reply.code(500);
      return { error: message };
    }
  });

  // Manual trigger for processing existing scraped data
  fastify.post('/api/scraper/process', {
    schema: {
      body: toJsonSchema(z.object({
        csvFilePath: z.string()
      })),
      response: {
        200: toJsonSchema(z.object({
          imported: z.number(),
          updated: z.number(),
          skipped: z.number()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const { csvFilePath } = request.body as any;
      const tenantId = request.user.tenantId;
      const userId = request.user.id;

      // Create a new transformer instance to process the data
      const { TransformerService } = await import('../services/scraper/transformer.service');
      const transformer = new TransformerService(prisma);
      
      const result = await transformer.processScrapedData(
        csvFilePath, 
        tenantId, 
        userId
      );

      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process scraped data';
      reply.code(500);
      return { error: message };
    }
  });

  // WebSocket endpoint for real-time progress updates
  fastify.register(async function (fastify) {
    fastify.get('/api/scraper/ws/:jobId', { websocket: true }, (connection, req) => {
      const jobId = (req.params as any).jobId;
      
      // Listen for scraper events
      const onProgress = (receivedJobId: string, progress: any) => {
        if (receivedJobId === jobId) {
          connection.send(JSON.stringify({ type: 'progress', data: progress }));
        }
      };
      
      const onCompleted = (receivedJobId: string, result: any) => {
        if (receivedJobId === jobId) {
          connection.send(JSON.stringify({ type: 'completed', data: result }));
        }
      };
      
      const onFailed = (receivedJobId: string, error: string) => {
        if (receivedJobId === jobId) {
          connection.send(JSON.stringify({ type: 'failed', data: { error } }));
        }
      };

      scraperService.on('progress', onProgress);
      scraperService.on('completed', onCompleted);
      scraperService.on('failed', onFailed);

      connection.on('close', () => {
        scraperService.off('progress', onProgress);
        scraperService.off('completed', onCompleted);
        scraperService.off('failed', onFailed);
      });
    });
  });

  // Get performance metrics
  fastify.get('/api/scraper/metrics', {
    schema: {
      querystring: toJsonSchema(z.object({
        days: z.string().transform(Number).optional().default(7)
      })),
      response: {
        200: toJsonSchema(z.object({
          performance: z.any(),
          system: z.any(),
          activeJobs: z.array(z.any())
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const { days } = request.query as any;
      const tenantId = request.user.tenantId;

      const [performance, system, activeJobs] = await Promise.all([
        scraperService.getPerformanceMetrics(tenantId, days),
        scraperService.getSystemMetrics(),
        scraperService.getActiveJobMetrics()
      ]);

      return { performance, system, activeJobs };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get metrics';
      reply.code(500);
      return { error: message };
    }
  });

  // Health check endpoint
  fastify.get('/api/scraper/health', async (request, reply) => {
    try {
      const systemMetrics = scraperService.getSystemMetrics();
      
      return {
        status: 'healthy',
        scraperPath: scraperService['scraperPath'],
        systemMetrics,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      reply.code(503);
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  });
}