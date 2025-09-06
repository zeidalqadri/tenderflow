/**
 * Secure Ingestion API Routes for Hybrid Deployment
 * Handles data ingestion from local Python scrapers to GCP
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { toJsonSchema } from '../utils/schema-converter';
import { prisma } from '../database/client';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Request/Response schemas
const TenderIngestionSchema = z.object({
  tenders: z.array(z.object({
    id: z.string().max(50),
    title: z.string().max(500),
    status: z.string().max(100),
    value: z.string().max(50),
    url: z.string().url().max(500).optional(),
    deadline: z.string().datetime().optional(),
    sourcePortal: z.string(),
    metadata: z.record(z.any()).optional()
  })).max(100), // Limit batch size
  metadata: z.object({
    scraperId: z.string(),
    batchId: z.string(),
    scrapedAt: z.string().datetime(),
    checksum: z.string(),
    pageNumber: z.number().optional(),
    totalPages: z.number().optional()
  })
});

const IngestionStatusSchema = z.object({
  uploadId: z.string().uuid()
});

// Rate limiting configuration
const RATE_LIMITS = {
  perMinute: 100,
  perHour: 1000,
  maxBatchSize: 100,
  maxFileSize: 52428800 // 50MB
};

export async function ingestionRoutes(fastify: FastifyInstance) {
  // Middleware for scraper authentication
  const authenticateScraper = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing authentication token' });
      }

      const token = authHeader.substring(7);
      
      // Verify JWT token
      const payload = await fastify.jwt.verify(token) as any;
      
      // Check if it's a scraper token
      if (payload.type !== 'scraper') {
        return reply.code(403).send({ error: 'Invalid token type' });
      }

      // Check rate limits
      const rateLimitKey = `rate_limit:scraper:${payload.scraperId}`;
      const redis = (fastify as any).redis;
      
      if (redis) {
        const currentRequests = await redis.incr(rateLimitKey);
        
        if (currentRequests === 1) {
          await redis.expire(rateLimitKey, 60); // 1 minute window
        }
        
        if (currentRequests > RATE_LIMITS.perMinute) {
          return reply.code(429).send({ 
            error: 'Rate limit exceeded',
            retryAfter: 60 
          });
        }
      }

      // Attach scraper info to request
      (request as any).scraperAuth = payload;
      
    } catch (error) {
      fastify.log.error('Scraper authentication failed:', error);
      return reply.code(401).send({ error: 'Authentication failed' });
    }
  };

  // Data validation and sanitization
  const sanitizeTenderData = (tender: any) => {
    // Remove HTML tags and dangerous characters
    const sanitizeString = (str: string) => {
      return str
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>'"&]/g, '') // Remove dangerous characters
        .trim();
    };

    return {
      ...tender,
      title: sanitizeString(tender.title).substring(0, 500),
      status: sanitizeString(tender.status).substring(0, 100),
      value: sanitizeString(tender.value).substring(0, 50),
      url: tender.url ? sanitizeString(tender.url).substring(0, 500) : undefined
    };
  };

  // Main tender ingestion endpoint
  fastify.post('/api/ingestion/tenders', {
    preHandler: authenticateScraper,
    schema: {
      body: toJsonSchema(TenderIngestionSchema),
      response: {
        200: toJsonSchema(z.object({
          uploadId: z.string(),
          status: z.string(),
          processed: z.number(),
          skipped: z.number(),
          errors: z.array(z.string()).optional()
        })),
        400: toJsonSchema(z.object({ error: z.string() })),
        401: toJsonSchema(z.object({ error: z.string() })),
        429: toJsonSchema(z.object({ 
          error: z.string(),
          retryAfter: z.number()
        }))
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    const uploadId = uuidv4();
    const { tenders, metadata } = request.body as z.infer<typeof TenderIngestionSchema>;
    const scraperAuth = (request as any).scraperAuth;
    
    // Set correlation ID for end-to-end tracing
    if (request.tracking) {
      request.tracking.correlationId = metadata.batchId || uploadId;
    }

    try {
      // Verify data integrity with checksum
      const dataString = JSON.stringify(tenders);
      const computedChecksum = createHash('sha256').update(dataString).digest('hex');
      
      if (computedChecksum !== metadata.checksum) {
        fastify.log.warn('Checksum mismatch for upload', { uploadId, scraperId: metadata.scraperId });
        return reply.code(400).send({ error: 'Data integrity check failed' });
      }

      // Check for duplicate batch
      const existingBatch = await prisma.scrapingLog.findFirst({
        where: {
          metadata: {
            path: ['batchId'],
            equals: metadata.batchId
          }
        }
      });

      if (existingBatch) {
        fastify.log.info('Duplicate batch detected', { batchId: metadata.batchId });
        return reply.send({
          uploadId: existingBatch.id,
          status: 'duplicate',
          processed: 0,
          skipped: tenders.length,
          errors: ['Batch already processed']
        });
      }

      // Sanitize and validate tender data
      const sanitizedTenders = tenders.map(sanitizeTenderData);
      
      // Process tenders
      let processed = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const tender of sanitizedTenders) {
        try {
          // Check if tender already exists
          const existingTender = await prisma.tender.findFirst({
            where: {
              externalId: tender.id,
              sourcePortal: tender.sourcePortal
            }
          });

          if (existingTender) {
            // Update existing tender if data has changed
            await prisma.tender.update({
              where: { id: existingTender.id },
              data: {
                title: tender.title,
                status: tender.status,
                estimatedValue: tender.value,
                url: tender.url,
                deadline: tender.deadline ? new Date(tender.deadline) : undefined,
                metadata: tender.metadata as any,
                updatedAt: new Date()
              }
            });
            skipped++;
          } else {
            // Create new tender
            await prisma.tender.create({
              data: {
                tenantId: scraperAuth.tenantId || 'default',
                externalId: tender.id,
                title: tender.title,
                status: tender.status,
                estimatedValue: tender.value,
                url: tender.url,
                sourcePortal: tender.sourcePortal,
                deadline: tender.deadline ? new Date(tender.deadline) : undefined,
                metadata: tender.metadata as any,
                category: 'UNCATEGORIZED',
                visibility: 'PRIVATE'
              }
            });
            processed++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to process tender ${tender.id}: ${errorMessage}`);
          fastify.log.error('Failed to process tender', { tenderId: tender.id, error });
        }
      }

      // Log ingestion event
      await prisma.scrapingLog.create({
        data: {
          tenantId: scraperAuth.tenantId || 'default',
          status: 'COMPLETED',
          sourcePortal: tenders[0]?.sourcePortal || 'unknown',
          tendersScraped: processed,
          tendersTotal: tenders.length,
          startedAt: new Date(metadata.scrapedAt),
          completedAt: new Date(),
          metadata: {
            uploadId,
            batchId: metadata.batchId,
            scraperId: metadata.scraperId,
            pageNumber: metadata.pageNumber,
            totalPages: metadata.totalPages,
            errors: errors.length > 0 ? errors : undefined
          } as any,
          triggeredBy: 'API',
          triggeredByUserId: scraperAuth.userId
        }
      });

      // Send success response
      const processingTime = Date.now() - startTime;
      
      // Record metrics
      if ((fastify as any).monitoring) {
        (fastify as any).monitoring.recordIngestionMetrics({
          tendersReceived: tenders.length,
          tendersProcessed: processed,
          validationFailures: errors.length,
          duplicatesDetected: skipped,
          processingTimeMs: processingTime
        }, metadata.batchId);
      }
      
      fastify.log.info('Tender ingestion completed', {
        uploadId,
        processed,
        skipped,
        errors: errors.length,
        processingTimeMs: processingTime
      });

      return reply.send({
        uploadId,
        status: 'completed',
        processed,
        skipped,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      fastify.log.error('Tender ingestion failed', { uploadId, error });
      
      // Log failed ingestion
      await prisma.scrapingLog.create({
        data: {
          tenantId: scraperAuth.tenantId || 'default',
          status: 'FAILED',
          sourcePortal: tenders[0]?.sourcePortal || 'unknown',
          tendersScraped: 0,
          tendersTotal: tenders.length,
          startedAt: new Date(metadata.scrapedAt),
          completedAt: new Date(),
          metadata: {
            uploadId,
            batchId: metadata.batchId,
            scraperId: metadata.scraperId,
            error: error instanceof Error ? error.message : 'Unknown error'
          } as any,
          triggeredBy: 'API',
          triggeredByUserId: scraperAuth.userId
        }
      });

      return reply.code(500).send({ 
        error: 'Failed to process tender data' 
      });
    }
  });

  // Get ingestion status
  fastify.get('/api/ingestion/status/:uploadId', {
    preHandler: authenticateScraper,
    schema: {
      params: toJsonSchema(IngestionStatusSchema),
      response: {
        200: toJsonSchema(z.object({
          uploadId: z.string(),
          status: z.string(),
          processed: z.number().optional(),
          total: z.number().optional(),
          startedAt: z.string().datetime().optional(),
          completedAt: z.string().datetime().optional(),
          errors: z.array(z.string()).optional()
        })),
        404: toJsonSchema(z.object({ error: z.string() }))
      }
    }
  }, async (request, reply) => {
    const { uploadId } = request.params as z.infer<typeof IngestionStatusSchema>;
    const scraperAuth = (request as any).scraperAuth;

    try {
      const log = await prisma.scrapingLog.findFirst({
        where: {
          metadata: {
            path: ['uploadId'],
            equals: uploadId
          },
          tenantId: scraperAuth.tenantId || 'default'
        }
      });

      if (!log) {
        return reply.code(404).send({ error: 'Upload not found' });
      }

      return reply.send({
        uploadId,
        status: log.status,
        processed: log.tendersScraped,
        total: log.tendersTotal,
        startedAt: log.startedAt.toISOString(),
        completedAt: log.completedAt?.toISOString(),
        errors: (log.metadata as any)?.errors
      });

    } catch (error) {
      fastify.log.error('Failed to get ingestion status', { uploadId, error });
      return reply.code(500).send({ error: 'Failed to get status' });
    }
  });

  // Health check endpoint for scrapers
  fastify.get('/api/ingestion/health', async (request, reply) => {
    try {
      // Check database connectivity
      await prisma.$queryRaw`SELECT 1`;
      
      // Check Redis connectivity if available
      const redis = (fastify as any).redis;
      let redisHealthy = false;
      
      if (redis) {
        try {
          await redis.ping();
          redisHealthy = true;
        } catch (error) {
          fastify.log.warn('Redis health check failed', error);
        }
      }

      return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: true,
          redis: redisHealthy,
          api: true
        },
        version: process.env.API_VERSION || '1.0.0'
      });

    } catch (error) {
      fastify.log.error('Health check failed', error);
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed'
      });
    }
  });

  // Metrics endpoint for monitoring
  fastify.get('/api/ingestion/metrics', {
    preHandler: authenticateScraper,
    schema: {
      response: {
        200: toJsonSchema(z.object({
          scraperId: z.string(),
          metrics: z.object({
            totalIngested: z.number(),
            totalErrors: z.number(),
            lastIngestionAt: z.string().datetime().optional(),
            averageProcessingTime: z.number().optional()
          })
        }))
      }
    }
  }, async (request, reply) => {
    const scraperAuth = (request as any).scraperAuth;

    try {
      const logs = await prisma.scrapingLog.findMany({
        where: {
          metadata: {
            path: ['scraperId'],
            equals: scraperAuth.scraperId
          },
          tenantId: scraperAuth.tenantId || 'default'
        },
        orderBy: { startedAt: 'desc' },
        take: 100
      });

      const totalIngested = logs.reduce((sum, log) => sum + log.tendersScraped, 0);
      const totalErrors = logs.filter(log => log.status === 'FAILED').length;
      const lastIngestion = logs[0]?.startedAt;
      
      const processingTimes = logs
        .filter(log => log.completedAt)
        .map(log => log.completedAt!.getTime() - log.startedAt.getTime());
      
      const averageProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
        : undefined;

      return reply.send({
        scraperId: scraperAuth.scraperId,
        metrics: {
          totalIngested,
          totalErrors,
          lastIngestionAt: lastIngestion?.toISOString(),
          averageProcessingTime
        }
      });

    } catch (error) {
      fastify.log.error('Failed to get metrics', { error });
      return reply.code(500).send({ error: 'Failed to get metrics' });
    }
  });
}