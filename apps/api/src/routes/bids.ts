// Bid workspace routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '../generated/prisma';
import { z } from 'zod';
import { toJsonSchema } from '../utils/schema-converter';
import {
  BidBaseSchema,
  UpdateBidSchema,
  SubmitBidSchema,
  ApiResponseSchema,
  UuidSchema,
} from '../schemas';
import { NotFoundError, BusinessLogicError } from '../plugins/error-handler';

const bidRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Get bid by tender ID
  fastify.get('/:tenderId', {
    schema: {
      description: 'Get bid workspace for tender',
      tags: ['Bids'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({ tenderId: UuidSchema })),
      response: { 200: toJsonSchema(ApiResponseSchema(BidBaseSchema.nullable())) },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'viewer'),
    ],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;

    try {
      const bid = await prisma.bid.findUnique({
        where: { tenderId },
      });

      return reply.send({
        success: true,
        data: bid,
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching bid');
      throw new Error('Failed to fetch bid');
    }
  });

  // Update bid workspace
  fastify.put('/:tenderId', {
    schema: {
      description: 'Update bid workspace',
      tags: ['Bids'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({ tenderId: UuidSchema })),
      body: toJsonSchema(UpdateBidSchema),
      response: { 200: toJsonSchema(ApiResponseSchema(BidBaseSchema)) },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'contributor'),
    ],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;
    const updateData = request.body as any;

    try {
      const bid = await prisma.bid.upsert({
        where: { tenderId },
        update: updateData,
        create: {
          tenderId,
          ...updateData,
        },
      });

      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'UPDATE',
        resource: 'bid',
        resourceId: bid.id,
        newValues: updateData,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: bid,
      });
    } catch (error) {
      fastify.log.error(error, 'Error updating bid');
      throw new Error('Failed to update bid');
    }
  });

  // Submit bid
  fastify.post('/:tenderId/submit', {
    schema: {
      description: 'Submit bid for tender',
      tags: ['Bids'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({ tenderId: UuidSchema })),
      body: toJsonSchema(SubmitBidSchema),
      response: { 200: toJsonSchema(ApiResponseSchema(BidBaseSchema)) },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'contributor'),
    ],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;

    try {
      const bid = await prisma.bid.findUnique({
        where: { tenderId },
      });

      if (!bid) {
        throw new NotFoundError('Bid not found');
      }

      if (bid.isSubmitted) {
        throw new BusinessLogicError('Bid already submitted');
      }

      const updatedBid = await prisma.bid.update({
        where: { tenderId },
        data: {
          isSubmitted: true,
          submittedAt: new Date(),
        },
      });

      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'UPDATE',
        resource: 'bid',
        resourceId: bid.id,
        newValues: { isSubmitted: true },
        metadata: { action: 'submit' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: updatedBid,
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      fastify.log.error(error, 'Error submitting bid');
      throw new Error('Failed to submit bid');
    }
  });

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default bidRoutes;