// Submission tracking routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  SubmissionBaseSchema,
  CreateSubmissionSchema,
  UpdateSubmissionSchema,
  SubmissionQuerySchema,
  ApiResponseSchema,
  PaginatedResponseSchema,
  UuidSchema,
} from '../schemas';
import { NotFoundError } from '../plugins/error-handler';

const submissionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Get submissions with pagination
  fastify.get('/', {
    schema: {
      description: 'Get paginated list of submissions',
      tags: ['Submissions'],
      security: [{ bearerAuth: [] }],
      querystring: SubmissionQuerySchema,
      response: {
        200: PaginatedResponseSchema(SubmissionBaseSchema.extend({
          tender: z.object({
            id: z.string(),
            title: z.string(),
          }),
          submitter: z.object({
            firstName: z.string(),
            lastName: z.string(),
          }),
        })),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { page = 1, limit = 20, tenderId, method, submittedBy, dateRange } = request.query as any;
    const skip = (page - 1) * limit;

    const where: any = {
      tender: { tenantId: request.tenant!.id },
    };

    if (tenderId) where.tenderId = tenderId;
    if (method) where.method = method;
    if (submittedBy) where.submittedBy = submittedBy;
    if (dateRange?.from || dateRange?.to) {
      where.submittedAt = {};
      if (dateRange.from) where.submittedAt.gte = dateRange.from;
      if (dateRange.to) where.submittedAt.lte = dateRange.to;
    }

    try {
      const [submissions, total] = await Promise.all([
        prisma.submission.findMany({
          where,
          orderBy: { submittedAt: 'desc' },
          skip,
          take: limit,
          include: {
            tender: { select: { id: true, title: true } },
            submitter: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.submission.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: submissions,
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching submissions');
      throw new Error('Failed to fetch submissions');
    }
  });

  // Create submission
  fastify.post('/', {
    schema: {
      description: 'Create new submission record',
      tags: ['Submissions'],
      security: [{ bearerAuth: [] }],
      body: CreateSubmissionSchema,
      response: { 201: ApiResponseSchema(SubmissionBaseSchema) },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requireTenant,
      fastify.requireTenderRole('body:tenderId', 'contributor'),
    ],
  }, async (request, reply) => {
    const submissionData = request.body as any;

    try {
      const submission = await prisma.submission.create({
        data: {
          ...submissionData,
          submittedBy: request.user!.userId,
        },
      });

      // Trigger receipt parsing job if receipt uploaded
      if (submissionData.receiptKey) {
        const { scheduleReceiptParse } = await import('@tenderflow/jobs');
        
        try {
          const jobId = await scheduleReceiptParse({
            submissionId: submission.id,
            receiptKey: submissionData.receiptKey,
            tenantId: request.tenant!.id,
            userId: request.user!.userId,
            metadata: {
              originalName: submissionData.receiptKey,
              source: 'submission',
            },
          });
          
          fastify.log.info(`Receipt parsing job queued: ${jobId} for submission ${submission.id}`);
        } catch (error) {
          fastify.log.error('Failed to queue receipt parsing job:', error);
          // Don't fail the request if job queueing fails
        }
      }

      await fastify.audit({
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        action: 'CREATE',
        resource: 'submission',
        resourceId: submission.id,
        newValues: submissionData,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(201).send({
        success: true,
        data: submission,
      });
    } catch (error) {
      fastify.log.error(error, 'Error creating submission');
      throw new Error('Failed to create submission');
    }
  });

  // Update submission
  fastify.put('/:id', {
    schema: {
      description: 'Update submission record',
      tags: ['Submissions'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: UuidSchema }),
      body: UpdateSubmissionSchema,
      response: { 200: ApiResponseSchema(SubmissionBaseSchema) },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const updateData = request.body as any;

    try {
      const submission = await prisma.submission.findUnique({
        where: { id },
        include: { tender: true },
      });

      if (!submission || submission.tender.tenantId !== request.tenant!.id) {
        throw new NotFoundError('Submission not found');
      }

      // Check tender access
      const hasAccess = await fastify.checkTenderPermission(
        request.user!.userId,
        submission.tenderId,
        'write'
      );

      if (!hasAccess) {
        throw new NotFoundError('Submission not found');
      }

      const updatedSubmission = await prisma.submission.update({
        where: { id },
        data: updateData,
      });

      return reply.send({
        success: true,
        data: updatedSubmission,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error updating submission');
      throw new Error('Failed to update submission');
    }
  });

  // Trigger receipt parsing
  fastify.post('/:id/parse-receipt', {
    schema: {
      description: 'Trigger receipt parsing for submission',
      tags: ['Submissions'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: UuidSchema }),
      response: {
        200: ApiResponseSchema(z.object({
          message: z.string(),
          jobId: z.string().optional(),
        })),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { id } = request.params as any;

    try {
      const submission = await prisma.submission.findUnique({
        where: { id },
        include: { tender: true },
      });

      if (!submission || submission.tender.tenantId !== request.tenant!.id) {
        throw new NotFoundError('Submission not found');
      }

      if (!submission.receiptKey) {
        throw new NotFoundError('No receipt file found');
      }

      // Queue parsing job
      const { scheduleReceiptParse } = await import('@tenderflow/jobs');
      
      const jobId = await scheduleReceiptParse({
        submissionId: submission.id,
        receiptKey: submission.receiptKey,
        tenantId: request.tenant!.id,
        userId: request.user!.userId,
        metadata: {
          originalName: submission.receiptKey,
          source: 'manual_trigger',
        },
      });

      return reply.send({
        success: true,
        data: {
          message: 'Receipt parsing job queued',
          jobId,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error triggering receipt parsing');
      throw new Error('Failed to trigger receipt parsing');
    }
  });

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default submissionRoutes;