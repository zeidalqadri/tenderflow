// Document routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '../generated/prisma';
import { z } from 'zod';
import { toJsonSchema } from '../utils/schema-converter';
import {
  DocumentBaseSchema,
  CreateDocumentSchema,
  DocumentPresignSchema,
  DocumentUploadConfirmSchema,
  DocumentQuerySchema,
  ApiResponseSchema,
  PaginatedResponseSchema,
  UuidSchema,
} from '../schemas';
import { NotFoundError } from '../plugins/error-handler';

const documentRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Get documents with pagination
  fastify.get('/', {
    schema: {
      description: 'Get paginated list of documents',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }],
      querystring: toJsonSchema(DocumentQuerySchema),
      response: {
        200: toJsonSchema(PaginatedResponseSchema(DocumentBaseSchema.extend({
          tender: z.object({
            id: z.string(),
            title: z.string(),
          }).optional(),
          uploader: z.object({
            firstName: z.string(),
            lastName: z.string(),
          }),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { page = 1, limit = 20, tenderId, type, uploadedBy, search } = request.query as any;
    const skip = (page - 1) * limit;

    const where: any = {
      tender: { tenantId: request.tenant!.id },
      isDeleted: false,
    };

    if (tenderId) where.tenderId = tenderId;
    if (type) where.type = type;
    if (uploadedBy) where.uploadedBy = uploadedBy;
    if (search) {
      where.OR = [
        { filename: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
      ];
    }

    try {
      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where,
          orderBy: { uploadedAt: 'desc' },
          skip,
          take: limit,
          include: {
            tender: { select: { id: true, title: true } },
            uploader: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.document.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: documents,
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Error fetching documents');
      throw new Error('Failed to fetch documents');
    }
  });

  // Request presigned upload URL
  fastify.post('/presign', {
    schema: {
      description: 'Get presigned URL for document upload',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }],
      body: toJsonSchema(DocumentPresignSchema),
      response: {
        200: toJsonSchema(ApiResponseSchema(z.object({
          uploadUrl: z.string(),
          documentId: z.string(),
          expiresIn: z.number(),
        }))),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { filename, mimeType, size, type } = request.body as any;

    try {
      // Create document record
      const document = await prisma.document.create({
        data: {
          tenderId: '', // Will be set during confirmation
          uploadedBy: request.user!.userId,
          filename: `${Date.now()}-${filename}`,
          originalName: filename,
          mimeType,
          size,
          s3Key: '', // Will be set during confirmation
          s3Bucket: process.env.S3_BUCKET || 'tenderflow-documents',
          type,
          metadata: {},
        },
      });

      // In real implementation, generate presigned URL with S3/MinIO
      const mockUploadUrl = `https://example.com/upload/${document.id}`;

      return reply.send({
        success: true,
        data: {
          uploadUrl: mockUploadUrl,
          documentId: document.id,
          expiresIn: 3600, // 1 hour
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Error generating presigned URL');
      throw new Error('Failed to generate presigned URL');
    }
  });

  // Confirm document upload
  fastify.post('/confirm', {
    schema: {
      description: 'Confirm document upload completion',
      tags: ['Documents'],
      security: [{ bearerAuth: [] }],
      body: toJsonSchema(DocumentUploadConfirmSchema),
      response: {
        200: toJsonSchema(ApiResponseSchema(DocumentBaseSchema)),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { documentId, s3Key, finalSize } = request.body as any;

    try {
      const document = await prisma.document.update({
        where: { id: documentId },
        data: {
          s3Key,
          size: finalSize,
        },
      });

      // Trigger document processing job here

      return reply.send({
        success: true,
        data: document,
      });
    } catch (error) {
      fastify.log.error(error, 'Error confirming upload');
      throw new Error('Failed to confirm upload');
    }
  });

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default documentRoutes;