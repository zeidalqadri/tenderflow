// Export routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  ExportRequestSchema,
  ExportStatusSchema,
  ApiResponseSchema,
  UuidSchema,
} from '../schemas';

const exportRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Request export
  fastify.post('/request', {
    schema: {
      description: 'Request data export',
      tags: ['Exports'],
      security: [{ bearerAuth: [] }],
      body: ExportRequestSchema,
      response: {
        202: ApiResponseSchema(z.object({
          exportId: z.string(),
          message: z.string(),
        })),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const exportRequest = request.body as any;

    try {
      // Create export job record
      const exportId = `export-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // In a real implementation:
      // 1. Validate user has access to requested data
      // 2. Queue background job for export generation
      // 3. Store job status in database

      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'CREATE',
        resource: 'export',
        resourceId: exportId,
        newValues: exportRequest,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(202).send({
        success: true,
        data: {
          exportId,
          message: 'Export request queued for processing',
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Error requesting export');
      throw new Error('Failed to request export');
    }
  });

  // Get export status
  fastify.get('/status/:exportId', {
    schema: {
      description: 'Get export job status',
      tags: ['Exports'],
      security: [{ bearerAuth: [] }],
      params: z.object({ exportId: z.string() }),
      response: { 200: ApiResponseSchema(ExportStatusSchema) },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { exportId } = request.params as any;

    try {
      // Mock export status - in real implementation, check job queue/database
      const mockStatus = {
        id: exportId,
        type: 'tenders',
        status: 'completed' as const,
        downloadUrl: `https://example.com/downloads/${exportId}.csv`,
        error: null,
        createdAt: new Date(),
        completedAt: new Date(),
      };

      return reply.send({
        success: true,
        data: mockStatus,
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching export status');
      throw new Error('Failed to fetch export status');
    }
  });

  // Download export file
  fastify.get('/download/:exportId', {
    schema: {
      description: 'Download export file',
      tags: ['Exports'],
      security: [{ bearerAuth: [] }],
      params: z.object({ exportId: z.string() }),
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { exportId } = request.params as any;

    try {
      // In real implementation:
      // 1. Verify export belongs to user's tenant
      // 2. Check if export is ready
      // 3. Generate signed download URL or stream file

      reply.redirect('https://example.com/mock-export.csv');
    } catch (error) {
      fastify.log.error(error, 'Error downloading export');
      throw new Error('Failed to download export');
    }
  });

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default exportRoutes;