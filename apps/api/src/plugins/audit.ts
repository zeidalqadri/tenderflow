// Audit logging plugin for TenderFlow API
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '../generated/prisma';

export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'VIEW' 
  | 'DOWNLOAD' 
  | 'UPLOAD' 
  | 'TRANSITION' 
  | 'ASSIGN' 
  | 'UNASSIGN' 
  | 'LOGIN' 
  | 'LOGOUT';

export interface AuditLogEntry {
  tenantId: string;
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    audit: (entry: AuditLogEntry) => Promise<void>;
  }
}

const auditPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Audit logging function
  fastify.decorate('audit', async function (entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          oldValues: entry.oldValues,
          newValues: entry.newValues,
          metadata: entry.metadata || {},
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });

      fastify.log.debug(
        {
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          userId: entry.userId,
        },
        'Audit log created'
      );
    } catch (error) {
      // Don't throw audit errors - log them but continue
      fastify.log.error(error, 'Failed to create audit log');
    }
  });

  // Hook to automatically audit certain actions
  fastify.addHook('onResponse', async (request, reply) => {
    // Only audit successful operations
    if (reply.statusCode >= 400) {
      return;
    }

    // Skip auditing for health checks and options requests
    if (request.url.startsWith('/health') || 
        request.url.startsWith('/docs') ||
        request.method === 'OPTIONS') {
      return;
    }

    // Extract resource information from URL
    const urlParts = request.url.split('/');
    const apiIndex = urlParts.indexOf('api');
    
    if (apiIndex === -1 || apiIndex + 2 >= urlParts.length) {
      return;
    }

    const resource = urlParts[apiIndex + 2]; // e.g., 'tenders', 'documents'
    const resourceId = urlParts[apiIndex + 3]; // resource ID if present

    // Determine action based on HTTP method
    let action: AuditAction;
    switch (request.method) {
      case 'GET':
        action = resourceId ? 'VIEW' : 'VIEW';
        break;
      case 'POST':
        action = 'CREATE';
        break;
      case 'PUT':
      case 'PATCH':
        action = 'UPDATE';
        break;
      case 'DELETE':
        action = 'DELETE';
        break;
      default:
        return; // Don't audit other methods
    }

    // Only audit if we have tenant and user context
    if (!request.tenant || !request.user) {
      return;
    }

    // Create audit log entry
    await fastify.audit({
      tenantId: request.tenant.id,
      userId: request.user.userId,
      action,
      resource,
      resourceId: resourceId || 'bulk',
      metadata: {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
      },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default fp(auditPlugin, {
  name: 'audit',
  dependencies: ['error-handler'],
});