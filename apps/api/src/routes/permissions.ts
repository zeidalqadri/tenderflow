// Permission checking routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  ApiResponseSchema,
  UuidSchema,
} from '../schemas';
import { NotFoundError } from '../plugins/error-handler';

const permissionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Check user's permissions for a tender
  fastify.get('/:tenderId/permissions', {
    schema: {
      description: 'Check current user\'s permissions for a tender',
      tags: ['Tender Permissions'],
      security: [{ bearerAuth: [] }],
      params: z.object({
        tenderId: UuidSchema,
      }),
      response: {
        200: ApiResponseSchema(z.object({
          tenderId: z.string(),
          role: z.string().nullable(),
          permissions: z.object({
            canRead: z.boolean(),
            canWrite: z.boolean(),
            canDelete: z.boolean(),
            canManageAssignees: z.boolean(),
            canTransitionState: z.boolean(),
          }),
          isOwner: z.boolean(),
          isAdmin: z.boolean(),
        })),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;

    try {
      // Check if tender exists
      const tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        select: { id: true, deletedAt: true },
      });

      if (!tender || tender.deletedAt) {
        throw new NotFoundError('Tender not found');
      }

      // Get user's role for this tender
      const tenderRole = await fastify.getTenderRole(request.user!.userId, tenderId);
      
      // Check if user is admin
      const user = await prisma.user.findUnique({
        where: { id: request.user!.userId },
        select: { role: true },
      });

      const isAdmin = user?.role === 'admin';
      const isOwner = tenderRole === 'owner' || isAdmin;

      // Calculate permissions
      const permissions = {
        canRead: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'read'),
        canWrite: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'write'),
        canDelete: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'delete'),
        canManageAssignees: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'manage_assignees'),
        canTransitionState: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'transition_state'),
      };

      return reply.send({
        success: true,
        data: {
          tenderId,
          role: tenderRole,
          permissions,
          isOwner,
          isAdmin,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error checking permissions');
      throw new Error('Failed to check permissions');
    }
  });

  // Check specific permission for a tender
  fastify.get('/:tenderId/permissions/:action', {
    schema: {
      description: 'Check if current user can perform specific action on tender',
      tags: ['Tender Permissions'],
      security: [{ bearerAuth: [] }],
      params: z.object({
        tenderId: UuidSchema,
        action: z.enum(['read', 'write', 'delete', 'manage_assignees', 'transition_state']),
      }),
      response: {
        200: ApiResponseSchema(z.object({
          tenderId: z.string(),
          action: z.string(),
          allowed: z.boolean(),
          role: z.string().nullable(),
          reason: z.string().optional(),
        })),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { tenderId, action } = request.params as any;

    try {
      // Check if tender exists
      const tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        select: { id: true, deletedAt: true },
      });

      if (!tender || tender.deletedAt) {
        throw new NotFoundError('Tender not found');
      }

      // Check permission
      const allowed = await fastify.checkTenderPermission(request.user!.userId, tenderId, action);
      const role = await fastify.getTenderRole(request.user!.userId, tenderId);

      let reason: string | undefined;
      if (!allowed) {
        if (!role) {
          reason = 'User not assigned to this tender';
        } else {
          reason = `Insufficient permissions. Current role: ${role}`;
        }
      }

      return reply.send({
        success: true,
        data: {
          tenderId,
          action,
          allowed,
          role,
          reason,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error checking specific permission');
      throw new Error('Failed to check permission');
    }
  });

  // Check permissions for multiple tenders (bulk check)
  fastify.post('/permissions/bulk', {
    schema: {
      description: 'Bulk check permissions for multiple tenders',
      tags: ['Tender Permissions'],
      security: [{ bearerAuth: [] }],
      body: z.object({
        tenderIds: z.array(UuidSchema).min(1).max(50),
        actions: z.array(z.enum(['read', 'write', 'delete', 'manage_assignees', 'transition_state'])).optional(),
      }),
      response: {
        200: ApiResponseSchema(z.array(z.object({
          tenderId: z.string(),
          role: z.string().nullable(),
          permissions: z.object({
            canRead: z.boolean(),
            canWrite: z.boolean(),
            canDelete: z.boolean(),
            canManageAssignees: z.boolean(),
            canTransitionState: z.boolean(),
          }),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { tenderIds, actions = ['read', 'write', 'delete', 'manage_assignees', 'transition_state'] } = request.body as any;

    try {
      // Check if tenders exist and belong to tenant
      const tenders = await prisma.tender.findMany({
        where: {
          id: { in: tenderIds },
          tenantId: request.tenant!.id,
          deletedAt: null,
        },
        select: { id: true },
      });

      const existingTenderIds = tenders.map(t => t.id);

      // Check permissions for each tender
      const results = await Promise.all(
        existingTenderIds.map(async (tenderId) => {
          const role = await fastify.getTenderRole(request.user!.userId, tenderId);

          const permissions = {
            canRead: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'read'),
            canWrite: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'write'),
            canDelete: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'delete'),
            canManageAssignees: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'manage_assignees'),
            canTransitionState: await fastify.checkTenderPermission(request.user!.userId, tenderId, 'transition_state'),
          };

          return {
            tenderId,
            role,
            permissions,
          };
        })
      );

      return reply.send({
        success: true,
        data: results,
      });
    } catch (error) {
      fastify.log.error(error, 'Error in bulk permission check');
      throw new Error('Failed to check permissions');
    }
  });

  // Get all tenders user has access to with their roles
  fastify.get('/accessible-tenders', {
    schema: {
      description: 'Get all tenders the current user has access to',
      tags: ['Tender Permissions'],
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        role: z.enum(['owner', 'contributor', 'viewer']).optional(),
        includeArchived: z.boolean().default(false),
      }),
      response: {
        200: ApiResponseSchema(z.array(z.object({
          tenderId: z.string(),
          title: z.string(),
          status: z.string(),
          role: z.string(),
          permissions: z.object({
            canRead: z.boolean(),
            canWrite: z.boolean(),
            canDelete: z.boolean(),
            canManageAssignees: z.boolean(),
            canTransitionState: z.boolean(),
          }),
          createdAt: z.date(),
          deadline: z.date().nullable(),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { role, includeArchived } = request.query as any;

    try {
      // Get user's role to check if admin
      const user = await prisma.user.findUnique({
        where: { id: request.user!.userId },
        select: { role: true },
      });

      const isAdmin = user?.role === 'admin';

      let tenderQuery: any;

      if (isAdmin) {
        // Admin can see all tenders in tenant
        tenderQuery = {
          where: {
            tenantId: request.tenant!.id,
            ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
            deletedAt: null,
          },
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            deadline: true,
          },
        };
      } else {
        // Regular user can only see tenders they're assigned to
        tenderQuery = {
          where: {
            assignments: {
              some: {
                userId: request.user!.userId,
                ...(role && { role }),
              },
            },
            ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
            deletedAt: null,
          },
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            deadline: true,
            assignments: {
              where: { userId: request.user!.userId },
              select: { role: true },
            },
          },
        };
      }

      const tenders = await prisma.tender.findMany(tenderQuery);

      // Calculate permissions for each tender
      const results = await Promise.all(
        tenders.map(async (tender: any) => {
          const userRole = isAdmin 
            ? 'owner' // Treat admin as owner
            : tender.assignments?.[0]?.role || null;

          const permissions = {
            canRead: await fastify.checkTenderPermission(request.user!.userId, tender.id, 'read'),
            canWrite: await fastify.checkTenderPermission(request.user!.userId, tender.id, 'write'),
            canDelete: await fastify.checkTenderPermission(request.user!.userId, tender.id, 'delete'),
            canManageAssignees: await fastify.checkTenderPermission(request.user!.userId, tender.id, 'manage_assignees'),
            canTransitionState: await fastify.checkTenderPermission(request.user!.userId, tender.id, 'transition_state'),
          };

          return {
            tenderId: tender.id,
            title: tender.title,
            status: tender.status,
            role: userRole,
            permissions,
            createdAt: tender.createdAt,
            deadline: tender.deadline,
          };
        })
      );

      return reply.send({
        success: true,
        data: results,
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching accessible tenders');
      throw new Error('Failed to fetch accessible tenders');
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default permissionRoutes;