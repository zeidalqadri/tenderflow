// Tender CRUD routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  TenderBaseSchema,
  CreateTenderSchema,
  UpdateTenderSchema,
  TenderStateTransitionSchema,
  TenderQuerySchema,
  ApiResponseSchema,
  PaginatedResponseSchema,
  UuidSchema,
} from '../schemas';
import { 
  NotFoundError,
  BusinessLogicError,
  AuthorizationError 
} from '../plugins/error-handler';

// Define valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  SCRAPED: ['VALIDATED', 'ARCHIVED'],
  VALIDATED: ['QUALIFIED', 'ARCHIVED'],
  QUALIFIED: ['IN_BID', 'ARCHIVED'],
  IN_BID: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['WON', 'LOST', 'ARCHIVED'],
  WON: ['ARCHIVED'],
  LOST: ['ARCHIVED'],
  ARCHIVED: [], // Terminal state
};

const tenderRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Helper function to validate state transitions
  const canTransitionTo = (fromStatus: string, toStatus: string): boolean => {
    return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) || false;
  };

  // Get all tenders with filtering and pagination
  fastify.get('/', {
    schema: {
      description: 'Get paginated list of tenders with optional filtering',
      tags: ['Tenders'],
      security: [{ bearerAuth: [] }],
      querystring: TenderQuerySchema,
      response: {
        200: PaginatedResponseSchema(TenderBaseSchema.extend({
          creator: z.object({
            id: z.string(),
            firstName: z.string(),
            lastName: z.string(),
          }),
          assignments: z.array(z.object({
            id: z.string(),
            role: z.string(),
            user: z.object({
              id: z.string(),
              firstName: z.string(),
              lastName: z.string(),
            }),
          })),
          _count: z.object({
            documents: z.number(),
            submissions: z.number(),
          }),
        })),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const {
      page = 1,
      limit = 20,
      status,
      category,
      createdBy,
      search,
      minValue,
      maxValue,
      deadlineRange,
      sort,
    } = request.query as any;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      tenantId: request.tenant!.id,
      deletedAt: null,
    };

    if (status) where.status = status;
    if (category) where.category = category;
    if (createdBy) where.createdBy = createdBy;
    
    if (minValue || maxValue) {
      where.estimatedValue = {};
      if (minValue) where.estimatedValue.gte = minValue;
      if (maxValue) where.estimatedValue.lte = maxValue;
    }

    if (deadlineRange?.from || deadlineRange?.to) {
      where.deadline = {};
      if (deadlineRange.from) where.deadline.gte = deadlineRange.from;
      if (deadlineRange.to) where.deadline.lte = deadlineRange.to;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { source: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build order by
    const orderBy: any = {};
    if (sort?.field) {
      orderBy[sort.field] = sort.direction || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    try {
      const [tenders, total] = await Promise.all([
        prisma.tender.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            assignments: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            _count: {
              select: {
                documents: true,
                submissions: true,
              },
            },
          },
        }),
        prisma.tender.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return reply.send({
        success: true,
        data: tenders,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching tenders');
      throw new Error('Failed to fetch tenders');
    }
  });

  // Get single tender by ID
  fastify.get('/:id', {
    schema: {
      description: 'Get tender by ID with full details',
      tags: ['Tenders'],
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: UuidSchema,
      }),
      response: {
        200: ApiResponseSchema(TenderBaseSchema.extend({
          creator: z.object({
            id: z.string(),
            firstName: z.string(),
            lastName: z.string(),
          }),
          assignments: z.array(z.object({
            id: z.string(),
            role: z.string(),
            user: z.object({
              id: z.string(),
              firstName: z.string(),
              lastName: z.string(),
            }),
          })),
          documents: z.array(z.object({
            id: z.string(),
            filename: z.string(),
            type: z.string(),
            size: z.number(),
          })),
          bids: z.array(z.object({
            id: z.string(),
            totalAmount: z.number().nullable(),
            currency: z.string(),
            isSubmitted: z.boolean(),
          })),
          submissions: z.array(z.object({
            id: z.string(),
            method: z.string(),
            submittedAt: z.date(),
            status: z.string().nullable(),
          })),
        })),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTender,
      fastify.requireTenderRole('param:id', 'viewer'),
    ],
  }, async (request, reply) => {
    const { id } = request.params as any;

    try {
      const tender = await prisma.tender.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          documents: {
            where: { isDeleted: false },
            select: {
              id: true,
              filename: true,
              type: true,
              size: true,
            },
          },
          bids: {
            select: {
              id: true,
              totalAmount: true,
              currency: true,
              isSubmitted: true,
            },
          },
          submissions: {
            select: {
              id: true,
              method: true,
              submittedAt: true,
              status: true,
            },
          },
        },
      });

      if (!tender || tender.deletedAt) {
        throw new NotFoundError('Tender not found');
      }

      return reply.send({
        success: true,
        data: tender,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error fetching tender');
      throw new Error('Failed to fetch tender');
    }
  });

  // Create new tender
  fastify.post('/', {
    schema: {
      description: 'Create new tender',
      tags: ['Tenders'],
      security: [{ bearerAuth: [] }],
      body: CreateTenderSchema,
      response: {
        201: ApiResponseSchema(TenderBaseSchema),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const tenderData = request.body as any;

    try {
      const tender = await prisma.$transaction(async (tx) => {
        // Create tender
        const newTender = await tx.tender.create({
          data: {
            ...tenderData,
            tenantId: request.tenant!.id,
            createdBy: request.user!.userId,
            status: 'SCRAPED',
          },
        });

        // Auto-assign creator as owner
        await tx.tenderAssignment.create({
          data: {
            tenderId: newTender.id,
            userId: request.user!.userId,
            role: 'owner',
          },
        });

        return newTender;
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'CREATE',
        resource: 'tender',
        resourceId: tender.id,
        newValues: tenderData,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(201).send({
        success: true,
        data: tender,
      });
    } catch (error) {
      fastify.log.error(error, 'Error creating tender');
      throw new Error('Failed to create tender');
    }
  });

  // Update tender
  fastify.put('/:id', {
    schema: {
      description: 'Update tender by ID',
      tags: ['Tenders'],
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: UuidSchema,
      }),
      body: UpdateTenderSchema,
      response: {
        200: ApiResponseSchema(TenderBaseSchema),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTender,
      fastify.requireTenderRole('param:id', 'contributor'),
    ],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const updateData = request.body as any;

    try {
      // Get current tender for audit
      const currentTender = await prisma.tender.findUnique({
        where: { id },
      });

      if (!currentTender || currentTender.deletedAt) {
        throw new NotFoundError('Tender not found');
      }

      // Update tender
      const updatedTender = await prisma.tender.update({
        where: { id },
        data: updateData,
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'UPDATE',
        resource: 'tender',
        resourceId: id,
        oldValues: currentTender,
        newValues: updateData,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: updatedTender,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error updating tender');
      throw new Error('Failed to update tender');
    }
  });

  // Delete tender (soft delete)
  fastify.delete('/:id', {
    schema: {
      description: 'Delete tender by ID (soft delete)',
      tags: ['Tenders'],
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: UuidSchema,
      }),
      response: {
        200: ApiResponseSchema(z.object({
          message: z.string(),
        })),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:id', 'owner'),
    ],
  }, async (request, reply) => {
    const { id } = request.params as any;

    try {
      const tender = await prisma.tender.findUnique({
        where: { id },
      });

      if (!tender || tender.deletedAt) {
        throw new NotFoundError('Tender not found');
      }

      // Soft delete
      await prisma.tender.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'DELETE',
        resource: 'tender',
        resourceId: id,
        oldValues: tender,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: {
          message: 'Tender deleted successfully',
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error deleting tender');
      throw new Error('Failed to delete tender');
    }
  });

  // Transition tender state
  fastify.post('/:id/transition', {
    schema: {
      description: 'Transition tender to new state',
      tags: ['Tenders'],
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: UuidSchema,
      }),
      body: TenderStateTransitionSchema,
      response: {
        200: ApiResponseSchema(TenderBaseSchema),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:id', 'contributor'),
    ],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const { toStatus, reason, metadata = {} } = request.body as any;

    try {
      const tender = await prisma.tender.findUnique({
        where: { id },
      });

      if (!tender || tender.deletedAt) {
        throw new NotFoundError('Tender not found');
      }

      // Check if transition is valid
      if (!canTransitionTo(tender.status, toStatus)) {
        throw new BusinessLogicError(
          `Invalid state transition from ${tender.status} to ${toStatus}`
        );
      }

      // Perform transition in transaction
      const updatedTender = await prisma.$transaction(async (tx) => {
        // Update tender status
        const updated = await tx.tender.update({
          where: { id },
          data: { status: toStatus },
        });

        // Create state transition record
        await tx.stateTransition.create({
          data: {
            tenderId: id,
            fromStatus: tender.status,
            toStatus,
            triggeredBy: request.user!.userId,
            reason,
            metadata,
          },
        });

        return updated;
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'TRANSITION',
        resource: 'tender',
        resourceId: id,
        oldValues: { status: tender.status },
        newValues: { status: toStatus, reason },
        metadata: { fromStatus: tender.status, toStatus },
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
      fastify.log.error(error, 'Error transitioning tender state');
      throw new Error('Failed to transition tender state');
    }
  });

  // Get tender state transition history
  fastify.get('/:id/history', {
    schema: {
      description: 'Get tender state transition history',
      tags: ['Tenders'],
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: UuidSchema,
      }),
      response: {
        200: ApiResponseSchema(z.array(z.object({
          id: z.string(),
          fromStatus: z.string().nullable(),
          toStatus: z.string(),
          triggeredBy: z.string(),
          reason: z.string().nullable(),
          metadata: z.record(z.unknown()),
          createdAt: z.date(),
          user: z.object({
            firstName: z.string(),
            lastName: z.string(),
          }),
        }))),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:id', 'viewer'),
    ],
  }, async (request, reply) => {
    const { id } = request.params as any;

    try {
      const history = await prisma.stateTransition.findMany({
        where: { tenderId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return reply.send({
        success: true,
        data: history,
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching tender history');
      throw new Error('Failed to fetch tender history');
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default tenderRoutes;