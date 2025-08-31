// Tender outcome routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  TenderBaseSchema,
  ApiResponseSchema,
  UuidSchema,
} from '../schemas';
import { NotFoundError, BusinessLogicError } from '../plugins/error-handler';

const outcomeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Mark tender as WON
  fastify.post('/:tenderId/won', {
    schema: {
      description: 'Mark tender as WON',
      tags: ['Tender Outcomes'],
      security: [{ bearerAuth: [] }],
      params: z.object({ tenderId: UuidSchema }),
      body: z.object({
        notes: z.string().optional(),
        contractValue: z.number().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }),
      response: { 200: ApiResponseSchema(TenderBaseSchema) },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'owner'),
    ],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;
    const { notes, contractValue, startDate, endDate } = request.body as any;

    try {
      const tender = await prisma.tender.findUnique({
        where: { id: tenderId },
      });

      if (!tender || tender.deletedAt) {
        throw new NotFoundError('Tender not found');
      }

      if (tender.status !== 'SUBMITTED') {
        throw new BusinessLogicError('Can only mark submitted tenders as won');
      }

      const updatedTender = await prisma.$transaction(async (tx) => {
        // Update tender status
        const updated = await tx.tender.update({
          where: { id: tenderId },
          data: {
            status: 'WON',
            metadata: {
              ...tender.metadata,
              outcome: {
                result: 'WON',
                notes,
                contractValue,
                startDate,
                endDate,
                decidedAt: new Date(),
                decidedBy: request.user!.userId,
              },
            },
          },
        });

        // Create state transition
        await tx.stateTransition.create({
          data: {
            tenderId,
            fromStatus: tender.status,
            toStatus: 'WON',
            triggeredBy: request.user!.userId,
            reason: notes || 'Tender won',
            metadata: { contractValue, startDate, endDate },
          },
        });

        return updated;
      });

      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'TRANSITION',
        resource: 'tender',
        resourceId: tenderId,
        oldValues: { status: tender.status },
        newValues: { status: 'WON' },
        metadata: { outcome: 'WON', notes, contractValue },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: updatedTender,
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      fastify.log.error(error, 'Error marking tender as won');
      throw new Error('Failed to mark tender as won');
    }
  });

  // Mark tender as LOST
  fastify.post('/:tenderId/lost', {
    schema: {
      description: 'Mark tender as LOST',
      tags: ['Tender Outcomes'],
      security: [{ bearerAuth: [] }],
      params: z.object({ tenderId: UuidSchema }),
      body: z.object({
        reason: z.string().optional(),
        feedback: z.string().optional(),
        competitorInfo: z.record(z.unknown()).optional(),
      }),
      response: { 200: ApiResponseSchema(TenderBaseSchema) },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'owner'),
    ],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;
    const { reason, feedback, competitorInfo } = request.body as any;

    try {
      const tender = await prisma.tender.findUnique({
        where: { id: tenderId },
      });

      if (!tender || tender.deletedAt) {
        throw new NotFoundError('Tender not found');
      }

      if (tender.status !== 'SUBMITTED') {
        throw new BusinessLogicError('Can only mark submitted tenders as lost');
      }

      const updatedTender = await prisma.$transaction(async (tx) => {
        const updated = await tx.tender.update({
          where: { id: tenderId },
          data: {
            status: 'LOST',
            metadata: {
              ...tender.metadata,
              outcome: {
                result: 'LOST',
                reason,
                feedback,
                competitorInfo,
                decidedAt: new Date(),
                decidedBy: request.user!.userId,
              },
            },
          },
        });

        await tx.stateTransition.create({
          data: {
            tenderId,
            fromStatus: tender.status,
            toStatus: 'LOST',
            triggeredBy: request.user!.userId,
            reason: reason || 'Tender lost',
            metadata: { feedback, competitorInfo },
          },
        });

        return updated;
      });

      return reply.send({
        success: true,
        data: updatedTender,
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      fastify.log.error(error, 'Error marking tender as lost');
      throw new Error('Failed to mark tender as lost');
    }
  });

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default outcomeRoutes;