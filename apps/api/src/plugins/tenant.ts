// Multi-tenant plugin for TenderFlow API
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import { AuthorizationError, NotFoundError } from './error-handler';

export interface TenantInfo {
  id: string;
  name: string;
  subdomain: string;
  settings: Record<string, unknown>;
  isActive: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    validateTenant: (request: FastifyRequest, reply: any) => Promise<void>;
    requireTenant: (request: FastifyRequest, reply: any) => Promise<void>;
    getTenantFromUser: (userId: string) => Promise<TenantInfo | null>;
  }

  interface FastifyRequest {
    tenant?: TenantInfo;
  }
}

const tenantPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Helper function to extract tenant from various sources
  const extractTenantId = (request: FastifyRequest): string | null => {
    // 1. Check X-Tenant-ID header (explicit tenant specification)
    const headerTenantId = request.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      return headerTenantId;
    }

    // 2. Extract from JWT user payload
    if (request.user?.tenantId) {
      return request.user.tenantId;
    }

    // 3. Extract from subdomain (for web requests)
    const host = request.headers.host;
    if (host) {
      const subdomain = host.split('.')[0];
      // Don't treat common subdomains as tenant identifiers
      if (subdomain && !['www', 'api', 'app', 'admin'].includes(subdomain)) {
        return subdomain;
      }
    }

    return null;
  };

  // Load tenant information
  const loadTenant = async (tenantId: string): Promise<TenantInfo | null> => {
    try {
      // Try to find by ID first
      let tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          subdomain: true,
          settings: true,
          isActive: true,
        },
      });

      // If not found by ID, try by subdomain
      if (!tenant) {
        tenant = await prisma.tenant.findUnique({
          where: { subdomain: tenantId },
          select: {
            id: true,
            name: true,
            subdomain: true,
            settings: true,
            isActive: true,
          },
        });
      }

      if (!tenant) {
        return null;
      }

      return {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        settings: tenant.settings as Record<string, unknown>,
        isActive: tenant.isActive,
      };
    } catch (error) {
      fastify.log.error(error, 'Error loading tenant information');
      return null;
    }
  };

  // Get tenant from user (for cases where we only have user info)
  fastify.decorate('getTenantFromUser', async function (userId: string): Promise<TenantInfo | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              settings: true,
              isActive: true,
            },
          },
        },
      });

      if (!user?.tenant) {
        return null;
      }

      return {
        id: user.tenant.id,
        name: user.tenant.name,
        subdomain: user.tenant.subdomain,
        settings: user.tenant.settings as Record<string, unknown>,
        isActive: user.tenant.isActive,
      };
    } catch (error) {
      fastify.log.error(error, 'Error loading tenant from user');
      return null;
    }
  });

  // Validate tenant (optional - doesn't throw if no tenant)
  fastify.decorate('validateTenant', async function (request: FastifyRequest, reply: any) {
    const tenantId = extractTenantId(request);
    
    if (!tenantId) {
      fastify.log.debug('No tenant ID found in request');
      return;
    }

    const tenant = await loadTenant(tenantId);
    
    if (!tenant) {
      fastify.log.warn({ tenantId }, 'Tenant not found');
      return;
    }

    if (!tenant.isActive) {
      throw new AuthorizationError('Tenant is not active');
    }

    // Validate tenant matches authenticated user
    if (request.user && request.user.tenantId !== tenant.id) {
      throw new AuthorizationError('User not authorized for this tenant');
    }

    request.tenant = tenant;

    fastify.log.debug(
      {
        tenantId: tenant.id,
        tenantName: tenant.name,
        userId: request.user?.userId,
      },
      'Tenant validated'
    );
  });

  // Require tenant (throws if no valid tenant)
  fastify.decorate('requireTenant', async function (request: FastifyRequest, reply: any) {
    await fastify.validateTenant(request, reply);

    if (!request.tenant) {
      const tenantId = extractTenantId(request);
      if (!tenantId) {
        throw new AuthorizationError('Tenant ID required');
      }
      throw new NotFoundError('Tenant not found or inactive');
    }
  });

  // Add tenant validation hook for authenticated routes
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip for health checks, docs, and auth routes
    if (request.url.startsWith('/health') || 
        request.url.startsWith('/docs') ||
        request.url.startsWith('/api/v1/auth/login') ||
        request.url.startsWith('/api/v1/auth/register')) {
      return;
    }

    // For authenticated routes, always validate tenant
    if (request.user) {
      await fastify.requireTenant(request, reply);
    }
  });

  // Add tenant filtering to database queries
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.tenant) {
      // Add tenant context to request for use in route handlers
      request.routeConfig.tenantId = request.tenant.id;
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default fp(tenantPlugin, {
  name: 'tenant',
  dependencies: ['error-handler', 'jwt'],
});