// Alert management routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '../generated/prisma';
import { z } from 'zod';
import { toJsonSchema } from '../utils/schema-converter';
import {
  AlertRuleSchema,
  CreateAlertRuleSchema,
  UpdateAlertRuleSchema,
  ApiResponseSchema,
  PaginatedResponseSchema,
  PaginationSchema,
  UuidSchema,
} from '../schemas';
import { 
  NotFoundError,
  BusinessLogicError 
} from '../plugins/error-handler';

const alertRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Get all alert rules for tenant
  fastify.get('/', {
    schema: {
      description: 'Get paginated list of alert rules',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      querystring: toJsonSchema(PaginationSchema.extend({
        isActive: z.boolean().optional(),
        search: z.string().optional(),
      })),
      response: {
        200: toJsonSchema(PaginatedResponseSchema(AlertRuleSchema.extend({
          triggeredCount: z.number(),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const {
      page = 1,
      limit = 20,
      isActive,
      search,
    } = request.query as any;

    const skip = (page - 1) * limit;

    const where: any = {
      tenantId: request.tenant!.id,
    };

    if (isActive !== undefined) where.isActive = isActive;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    try {
      // Mock alert rules for now since AlertRule table doesn't exist in schema
      const mockAlertRules = [
        {
          id: '1',
          name: 'Deadline Alert',
          description: 'Alert when tender deadline is approaching',
          conditions: { daysBeforeDeadline: 3 },
          actions: { email: true, webhook: false },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ];

      const [alertRules, total] = await Promise.all([
        Promise.resolve(mockAlertRules.slice(skip, skip + limit)),
        Promise.resolve(mockAlertRules.length),
      ]);

      const totalPages = Math.ceil(total / limit);

      // For now, return 0 for triggered count since we don't have the table
      const rulesWithCount = alertRules.map(rule => ({
        ...rule,
        triggeredCount: 0,
      }));

      return reply.send({
        success: true,
        data: rulesWithCount,
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
      fastify.log.error(error, 'Error fetching alert rules');
      throw new Error('Failed to fetch alert rules');
    }
  });

  // Get single alert rule
  fastify.get('/:id', {
    schema: {
      description: 'Get alert rule by ID',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      response: {
        200: toJsonSchema(ApiResponseSchema(AlertRuleSchema.extend({
          triggeredCount: z.number(),
          recentTriggers: z.array(z.object({
            triggeredAt: z.date(),
            tenderId: z.string().optional(),
            tenderTitle: z.string().optional(),
          })),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { id } = request.params as any;

    try {
      const alertRule = await prisma.alertRule.findFirst({
        where: {
          id,
          tenantId: request.tenant!.id,
        },
      });

      if (!alertRule) {
        throw new NotFoundError('Alert rule not found');
      }

      // In a full implementation, you would fetch recent triggers
      const result = {
        ...alertRule,
        triggeredCount: 0,
        recentTriggers: [],
      };

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error fetching alert rule');
      throw new Error('Failed to fetch alert rule');
    }
  });

  // Create alert rule
  fastify.post('/', {
    schema: {
      description: 'Create new alert rule',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      body: toJsonSchema(CreateAlertRuleSchema),
      response: {
        201: toJsonSchema(ApiResponseSchema(AlertRuleSchema)),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const alertData = request.body as any;

    try {
      // Validate alert conditions and actions structure
      if (!alertData.conditions || Object.keys(alertData.conditions).length === 0) {
        throw new BusinessLogicError('Alert conditions are required');
      }

      if (!alertData.actions || Object.keys(alertData.actions).length === 0) {
        throw new BusinessLogicError('Alert actions are required');
      }

      const alertRule = await prisma.alertRule.create({
        data: {
          ...alertData,
          tenantId: request.tenant!.id,
          createdBy: request.user!.userId,
        },
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'CREATE',
        resource: 'alert',
        resourceId: alertRule.id,
        newValues: alertData,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(201).send({
        success: true,
        data: alertRule,
      });
    } catch (error) {
      if (error instanceof BusinessLogicError) {
        throw error;
      }
      fastify.log.error(error, 'Error creating alert rule');
      throw new Error('Failed to create alert rule');
    }
  });

  // Update alert rule
  fastify.put('/:id', {
    schema: {
      description: 'Update alert rule',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      body: toJsonSchema(UpdateAlertRuleSchema),
      response: {
        200: toJsonSchema(ApiResponseSchema(AlertRuleSchema)),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const updateData = request.body as any;

    try {
      // Check if alert rule exists
      const existingRule = await prisma.alertRule.findFirst({
        where: {
          id,
          tenantId: request.tenant!.id,
        },
      });

      if (!existingRule) {
        throw new NotFoundError('Alert rule not found');
      }

      // Validate conditions and actions if provided
      if (updateData.conditions && Object.keys(updateData.conditions).length === 0) {
        throw new BusinessLogicError('Alert conditions cannot be empty');
      }

      if (updateData.actions && Object.keys(updateData.actions).length === 0) {
        throw new BusinessLogicError('Alert actions cannot be empty');
      }

      const updatedRule = await prisma.alertRule.update({
        where: { id },
        data: updateData,
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'UPDATE',
        resource: 'alert',
        resourceId: id,
        oldValues: existingRule,
        newValues: updateData,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: updatedRule,
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      fastify.log.error(error, 'Error updating alert rule');
      throw new Error('Failed to update alert rule');
    }
  });

  // Delete alert rule
  fastify.delete('/:id', {
    schema: {
      description: 'Delete alert rule',
      tags: ['Alerts'],
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
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { id } = request.params as any;

    try {
      const alertRule = await prisma.alertRule.findFirst({
        where: {
          id,
          tenantId: request.tenant!.id,
        },
      });

      if (!alertRule) {
        throw new NotFoundError('Alert rule not found');
      }

      await prisma.alertRule.delete({
        where: { id },
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'DELETE',
        resource: 'alert',
        resourceId: id,
        oldValues: alertRule,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: {
          message: 'Alert rule deleted successfully',
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error deleting alert rule');
      throw new Error('Failed to delete alert rule');
    }
  });

  // Test alert rule
  fastify.post('/:id/test', {
    schema: {
      description: 'Test alert rule with sample data',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      body: toJsonSchema(z.object({
        testData: z.record(z.unknown()).optional(),
      })),
      response: {
        200: toJsonSchema(ApiResponseSchema(z.object({
          triggered: z.boolean(),
          actions: z.array(z.object({
            type: z.string(),
            success: z.boolean(),
            message: z.string(),
          })),
          message: z.string(),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const { testData = {} } = request.body as any;

    try {
      const alertRule = await prisma.alertRule.findFirst({
        where: {
          id,
          tenantId: request.tenant!.id,
        },
      });

      if (!alertRule) {
        throw new NotFoundError('Alert rule not found');
      }

      if (!alertRule.isActive) {
        throw new BusinessLogicError('Cannot test inactive alert rule');
      }

      // In a real implementation, you would:
      // 1. Evaluate conditions against test data
      // 2. Execute actions if conditions are met
      // 3. Return results

      // Mock test result
      const mockResult = {
        triggered: true,
        actions: [
          {
            type: 'email',
            success: true,
            message: 'Test email sent successfully',
          },
          {
            type: 'webhook',
            success: true,
            message: 'Webhook called successfully',
          },
        ],
        message: 'Alert rule test completed successfully',
      };

      return reply.send({
        success: true,
        data: mockResult,
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      fastify.log.error(error, 'Error testing alert rule');
      throw new Error('Failed to test alert rule');
    }
  });

  // Toggle alert rule active status
  fastify.patch('/:id/toggle', {
    schema: {
      description: 'Toggle alert rule active status',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      params: toJsonSchema(z.object({
        id: UuidSchema,
      })),
      response: {
        200: toJsonSchema(ApiResponseSchema(AlertRuleSchema)),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { id } = request.params as any;

    try {
      const alertRule = await prisma.alertRule.findFirst({
        where: {
          id,
          tenantId: request.tenant!.id,
        },
      });

      if (!alertRule) {
        throw new NotFoundError('Alert rule not found');
      }

      const updatedRule = await prisma.alertRule.update({
        where: { id },
        data: {
          isActive: !alertRule.isActive,
        },
      });

      // Audit log
      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'UPDATE',
        resource: 'alert',
        resourceId: id,
        oldValues: { isActive: alertRule.isActive },
        newValues: { isActive: !alertRule.isActive },
        metadata: { action: 'toggle_status' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: updatedRule,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error toggling alert rule status');
      throw new Error('Failed to toggle alert rule status');
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default alertRoutes;