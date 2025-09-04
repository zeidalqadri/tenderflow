// Tender assignee management routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '../generated/prisma';
import { z } from 'zod';
import { toJsonSchema } from '../utils/schema-converter';
import {
  TenderAssignmentSchema,
  CreateTenderAssignmentSchema,
  UpdateTenderAssignmentSchema,
  BulkAssignSchema,
  ApiResponseSchema,
  UuidSchema,
} from '../schemas';
import { 
  NotFoundError,
  ConflictError,
  BusinessLogicError,
  AuthorizationError 
} from '../plugins/error-handler';

const assigneeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Get all assignees for a tender
  fastify.get('/:tenderId/assignees', {
    schema: {
      description: 'Get all users assigned to a tender',
      tags: ['Tender Assignments'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        tenderId: UuidSchema,
      })),
      response: {
        200: toJsonSchema(ApiResponseSchema(z.array(TenderAssignmentSchema.extend({
          user: z.object({
            id: z.string(),
            firstName: z.string(),
            lastName: z.string(),
            email: z.string(),
          }),
        })))),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'viewer'),
    ],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;

    try {
      const assignments = await prisma.tenderAssignment.findMany({
        where: { tenderId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: [
          { role: 'asc' }, // owner, contributor, viewer
          { createdAt: 'asc' },
        ],
      });

      return reply.send({
        success: true,
        data: assignments,
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching tender assignments');
      throw new Error('Failed to fetch tender assignments');
    }
  });

  // Assign user to tender
  fastify.post('/:tenderId/assignees', {
    schema: {
      description: 'Assign user to tender with specific role',
      tags: ['Tender Assignments'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        tenderId: UuidSchema,
      })),
      body: toJsonSchema(CreateTenderAssignmentSchema),
      response: {
        201: toJsonSchema(ApiResponseSchema(TenderAssignmentSchema.extend({
          user: z.object({
            id: z.string(),
            firstName: z.string(),
            lastName: z.string(),
            email: z.string(),
          }),
        }))),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'owner'),
    ],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;
    const { userId, role } = request.body as any;

    try {
      // Check if user exists and belongs to same tenant
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          tenantId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (user.tenantId !== request.tenant!.id) {
        throw new AuthorizationError('User not in same tenant');
      }

      // Check if already assigned
      const existingAssignment = await prisma.tenderAssignment.findUnique({
        where: {
          tenderId_userId: {
            tenderId,
            userId,
          },
        },
      });

      if (existingAssignment) {
        throw new ConflictError('User already assigned to this tender');
      }

      // Use the ACL plugin to assign the role (handles ownership transfer)
      await fastify.assignTenderRole(userId, tenderId, role, request.user!.userId);

      // Fetch the created assignment
      const assignment = await prisma.tenderAssignment.findUnique({
        where: {
          tenderId_userId: {
            tenderId,
            userId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'ASSIGN',
        resource: 'tender',
        resourceId: tenderId,
        newValues: { assignedUserId: userId, role },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(201).send({
        success: true,
        data: assignment,
      });
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof ConflictError || 
          error instanceof AuthorizationError) {
        throw error;
      }
      fastify.log.error(error, 'Error assigning user to tender');
      throw new Error('Failed to assign user to tender');
    }
  });

  // Bulk assign users to tender
  fastify.post('/:tenderId/assignees/bulk', {
    schema: {
      description: 'Bulk assign multiple users to tender',
      tags: ['Tender Assignments'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        tenderId: UuidSchema,
      })),
      body: toJsonSchema(BulkAssignSchema),
      response: {
        201: toJsonSchema(ApiResponseSchema(z.object({
          created: z.array(TenderAssignmentSchema),
          errors: z.array(z.object({
            userId: z.string(),
            error: z.string(),
          })),
        }))),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'owner'),
    ],
  }, async (request, reply) => {
    const { tenderId } = request.params as any;
    const { assignments } = request.body as any;

    const created: any[] = [];
    const errors: any[] = [];

    // Process each assignment
    for (const assignment of assignments) {
      try {
        const { userId, role } = assignment;

        // Check if user exists and belongs to same tenant
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, tenantId: true },
        });

        if (!user || user.tenantId !== request.tenant!.id) {
          errors.push({ userId, error: 'User not found or not in same tenant' });
          continue;
        }

        // Check if already assigned
        const existingAssignment = await prisma.tenderAssignment.findUnique({
          where: {
            tenderId_userId: {
              tenderId,
              userId,
            },
          },
        });

        if (existingAssignment) {
          errors.push({ userId, error: 'User already assigned to this tender' });
          continue;
        }

        // Assign role
        await fastify.assignTenderRole(userId, tenderId, role, request.user!.userId);

        // Fetch created assignment
        const newAssignment = await prisma.tenderAssignment.findUnique({
          where: {
            tenderId_userId: {
              tenderId,
              userId,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });

        if (newAssignment) {
          created.push(newAssignment);
        }
      } catch (error) {
        errors.push({ 
          userId: assignment.userId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    // Audit log
    await fastify.audit({
      tenantId: request.tenant!.id,
      userId: request.user!.userId,
      action: 'ASSIGN',
      resource: 'tender',
      resourceId: tenderId,
      newValues: { bulkAssignments: assignments, created: created.length, errors: errors.length },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.code(201).send({
      success: true,
      data: {
        created,
        errors,
      },
    });
  });

  // Update user's role for tender
  fastify.put('/:tenderId/assignees/:userId', {
    schema: {
      description: 'Update user\'s role for tender',
      tags: ['Tender Assignments'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        tenderId: UuidSchema,
        userId: UuidSchema,
      })),
      body: toJsonSchema(UpdateTenderAssignmentSchema),
      response: {
        200: toJsonSchema(ApiResponseSchema(TenderAssignmentSchema.extend({
          user: z.object({
            id: z.string(),
            firstName: z.string(),
            lastName: z.string(),
            email: z.string(),
          }),
        }))),
      },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('param:tenderId', 'owner'),
    ],
  }, async (request, reply) => {
    const { tenderId, userId } = request.params as any;
    const { role } = request.body as any;

    try {
      // Check if assignment exists
      const existingAssignment = await prisma.tenderAssignment.findUnique({
        where: {
          tenderId_userId: {
            tenderId,
            userId,
          },
        },
      });

      if (!existingAssignment) {
        throw new NotFoundError('Assignment not found');
      }

      // Use ACL plugin to update role (handles ownership transfer)
      await fastify.assignTenderRole(userId, tenderId, role, request.user!.userId);

      // Fetch updated assignment
      const updatedAssignment = await prisma.tenderAssignment.findUnique({
        where: {
          tenderId_userId: {
            tenderId,
            userId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'UPDATE',
        resource: 'tender',
        resourceId: tenderId,
        oldValues: { role: existingAssignment.role },
        newValues: { role },
        metadata: { assignedUserId: userId },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: updatedAssignment,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error updating tender assignment');
      throw new Error('Failed to update tender assignment');
    }
  });

  // Remove user from tender
  fastify.delete('/:tenderId/assignees/:userId', {
    schema: {
      description: 'Remove user from tender',
      tags: ['Tender Assignments'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        tenderId: UuidSchema,
        userId: UuidSchema,
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
      fastify.requireTenderRole('param:tenderId', 'owner'),
    ],
  }, async (request, reply) => {
    const { tenderId, userId } = request.params as any;

    try {
      // Check if assignment exists
      const assignment = await prisma.tenderAssignment.findUnique({
        where: {
          tenderId_userId: {
            tenderId,
            userId,
          },
        },
      });

      if (!assignment) {
        throw new NotFoundError('Assignment not found');
      }

      // Prevent removing the last owner
      if (assignment.role === 'owner') {
        const ownerCount = await prisma.tenderAssignment.count({
          where: {
            tenderId,
            role: 'owner',
          },
        });

        if (ownerCount <= 1) {
          throw new BusinessLogicError('Cannot remove the last owner from tender');
        }
      }

      // Remove assignment
      await fastify.revokeTenderRole(userId, tenderId);

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'UNASSIGN',
        resource: 'tender',
        resourceId: tenderId,
        oldValues: { assignedUserId: userId, role: assignment.role },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: {
          message: 'User removed from tender successfully',
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      fastify.log.error(error, 'Error removing user from tender');
      throw new Error('Failed to remove user from tender');
    }
  });

  // Transfer ownership
  fastify.post('/:tenderId/assignees/:userId/transfer-ownership', {
    schema: {
      description: 'Transfer tender ownership to another user',
      tags: ['Tender Assignments'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        tenderId: UuidSchema,
        userId: UuidSchema,
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
      fastify.requireTenderRole('param:tenderId', 'owner'),
    ],
  }, async (request, reply) => {
    const { tenderId, userId } = request.params as any;

    try {
      // Check if target user exists and is already assigned
      const targetAssignment = await prisma.tenderAssignment.findUnique({
        where: {
          tenderId_userId: {
            tenderId,
            userId,
          },
        },
        include: {
          user: true,
        },
      });

      if (!targetAssignment) {
        throw new NotFoundError('Target user not assigned to this tender');
      }

      // Transfer ownership
      await fastify.assignTenderRole(userId, tenderId, 'owner', request.user!.userId);

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'UPDATE',
        resource: 'tender',
        resourceId: tenderId,
        newValues: { newOwner: userId },
        metadata: { action: 'ownership_transfer' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: {
          message: `Ownership transferred to ${targetAssignment.user.firstName} ${targetAssignment.user.lastName}`,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error transferring ownership');
      throw new Error('Failed to transfer ownership');
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default assigneeRoutes;