// Tender CRUD routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../database/client';
import { z } from 'zod';
import { toJsonSchema } from '../utils/schema-converter';
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
      querystring: toJsonSchema(TenderQuerySchema),
      response: {
        200: toJsonSchema(PaginatedResponseSchema(TenderBaseSchema.extend({
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
        }))),
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
        { sourcePortal: { contains: search, mode: 'insensitive' } },
        { externalId: { contains: search, mode: 'insensitive' } },
        { originalTitle: { contains: search, mode: 'insensitive' } },
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
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      response: {
        200: toJsonSchema(ApiResponseSchema(TenderBaseSchema.extend({
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
        }))),
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
      body: toJsonSchema(CreateTenderSchema),
      response: {
        201: toJsonSchema(ApiResponseSchema(TenderBaseSchema)),
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
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      body: toJsonSchema(UpdateTenderSchema),
      response: {
        200: toJsonSchema(ApiResponseSchema(TenderBaseSchema)),
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
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      response: {
        200: toJsonSchema(ApiResponseSchema(z.object({
          message: z.string(),
        }))),
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
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      body: toJsonSchema(TenderStateTransitionSchema),
      response: {
        200: toJsonSchema(ApiResponseSchema(TenderBaseSchema)),
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
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      response: {
        200: toJsonSchema(ApiResponseSchema(z.array(z.object({
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
        })))),
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

  // Get scraped tenders with scraper-specific information
  fastify.get('/scraped', {
    schema: {
      description: 'Get scraped tenders with scraper metadata',
      tags: ['Tenders', 'Scraper'],
      security: [{ bearerAuth: [] }],
      querystring: toJsonSchema(z.object({
        page: z.number().min(1).default(1).optional(),
        limit: z.number().min(1).max(100).default(20).optional(),
        sourcePortal: z.string().optional(),
        scrapedAfter: z.string().datetime().optional(),
        scrapedBefore: z.string().datetime().optional(),
      })),
      response: {
        200: toJsonSchema(PaginatedResponseSchema(TenderBaseSchema.extend({
          sourcePortal: z.string().nullable(),
          externalId: z.string().nullable(),
          originalTitle: z.string().nullable(),
          originalStatus: z.string().nullable(),
          originalValue: z.string().nullable(),
          scrapedAt: z.date().nullable(),
          sourceUrl: z.string().nullable(),
          creator: z.object({
            id: z.string(),
            firstName: z.string(),
            lastName: z.string(),
          }),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const {
      page = 1,
      limit = 20,
      sourcePortal,
      scrapedAfter,
      scrapedBefore,
    } = request.query as any;

    const skip = (page - 1) * limit;

    // Build where clause for scraped tenders
    const where: any = {
      tenantId: request.tenant!.id,
      deletedAt: null,
      scrapedAt: { not: null }, // Only scraped tenders
    };

    if (sourcePortal) {
      where.sourcePortal = sourcePortal;
    }

    if (scrapedAfter || scrapedBefore) {
      where.scrapedAt = {};
      if (scrapedAfter) where.scrapedAt.gte = new Date(scrapedAfter);
      if (scrapedBefore) where.scrapedAt.lte = new Date(scrapedBefore);
    }

    try {
      const [tenders, total] = await Promise.all([
        prisma.tender.findMany({
          where,
          orderBy: { scrapedAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            category: true,
            publishedAt: true,
            deadline: true,
            estimatedValue: true,
            currency: true,
            sourcePortal: true,
            externalId: true,
            originalTitle: true,
            originalStatus: true,
            originalValue: true,
            scrapedAt: true,
            sourceUrl: true,
            createdAt: true,
            updatedAt: true,
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
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
      fastify.log.error(error, 'Error fetching scraped tenders');
      throw new Error('Failed to fetch scraped tenders');
    }
  });

  // Get scraper statistics for tenders
  fastify.get('/stats/scraper', {
    schema: {
      description: 'Get scraper statistics for tenders',
      tags: ['Tenders', 'Scraper', 'Statistics'],
      security: [{ bearerAuth: [] }],
      response: {
        200: toJsonSchema(ApiResponseSchema(z.object({
          totalScraped: z.number(),
          byPortal: z.record(z.number()),
          byStatus: z.record(z.number()),
          recentActivity: z.object({
            last24h: z.number(),
            last7d: z.number(),
            last30d: z.number(),
          }),
          avgPerDay: z.number(),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    try {
      const tenantId = request.tenant!.id;
      
      // Get basic counts
      const [totalScraped, byPortal, byStatus] = await Promise.all([
        prisma.tender.count({
          where: {
            tenantId,
            deletedAt: null,
            scrapedAt: { not: null },
          },
        }),
        
        prisma.tender.groupBy({
          by: ['sourcePortal'],
          where: {
            tenantId,
            deletedAt: null,
            scrapedAt: { not: null },
            sourcePortal: { not: null },
          },
          _count: { id: true },
        }),
        
        prisma.tender.groupBy({
          by: ['status'],
          where: {
            tenantId,
            deletedAt: null,
            scrapedAt: { not: null },
          },
          _count: { id: true },
        }),
      ]);

      // Calculate recent activity
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [count24h, count7d, count30d] = await Promise.all([
        prisma.tender.count({
          where: {
            tenantId,
            deletedAt: null,
            scrapedAt: { gte: last24h },
          },
        }),
        prisma.tender.count({
          where: {
            tenantId,
            deletedAt: null,
            scrapedAt: { gte: last7d },
          },
        }),
        prisma.tender.count({
          where: {
            tenantId,
            deletedAt: null,
            scrapedAt: { gte: last30d },
          },
        }),
      ]);

      // Transform data for response
      const portalStats = byPortal.reduce((acc, item) => {
        if (item.sourcePortal) {
          acc[item.sourcePortal] = item._count.id;
        }
        return acc;
      }, {} as Record<string, number>);

      const statusStats = byStatus.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      const avgPerDay = count30d / 30;

      return reply.send({
        success: true,
        data: {
          totalScraped,
          byPortal: portalStats,
          byStatus: statusStats,
          recentActivity: {
            last24h: count24h,
            last7d: count7d,
            last30d: count30d,
          },
          avgPerDay: Math.round(avgPerDay * 100) / 100,
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching scraper statistics');
      throw new Error('Failed to fetch scraper statistics');
    }
  });

  // No cleanup needed - prisma client is shared
};

export default tenderRoutes;