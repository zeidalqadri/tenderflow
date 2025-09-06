// Access Control List (ACL) plugin for TenderFlow API
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '../generated/prisma';
import { AuthorizationError, NotFoundError } from './error-handler';

export type TenderRole = 'owner' | 'contributor' | 'viewer';
export type UserRole = 'admin' | 'member' | 'viewer';

export interface TenderPermission {
  tenderId: string;
  role: TenderRole;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canManageAssignees: boolean;
  canTransitionState: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    requireTender: (request: FastifyRequest, reply: any) => Promise<void>;
    requireTenderRole: (
      tenderId: string,
      requiredRole: TenderRole | TenderRole[]
    ) => (request: FastifyRequest, reply: any) => Promise<void>;
    checkTenderPermission: (
      userId: string,
      tenderId: string,
      action: 'read' | 'write' | 'delete' | 'manage_assignees' | 'transition_state'
    ) => Promise<boolean>;
    getTenderRole: (userId: string, tenderId: string) => Promise<TenderRole | null>;
    assignTenderRole: (
      userId: string,
      tenderId: string,
      role: TenderRole,
      assignedBy: string
    ) => Promise<void>;
    revokeTenderRole: (userId: string, tenderId: string) => Promise<void>;
    enforceOwnershipTransfer: (tenderId: string, newOwnerId: string) => Promise<void>;
  }

  interface FastifyRequest {
    tenderRole?: TenderRole;
    tenderPermissions?: TenderPermission;
  }
}

const aclPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Role hierarchy: owner > contributor > viewer
  const roleHierarchy: Record<TenderRole, number> = {
    owner: 3,
    contributor: 2,
    viewer: 1,
  };

  // Permission matrix based on role
  const getPermissions = (role: TenderRole): Omit<TenderPermission, 'tenderId' | 'role'> => {
    switch (role) {
      case 'owner':
        return {
          canRead: true,
          canWrite: true,
          canDelete: true,
          canManageAssignees: true,
          canTransitionState: true,
        };
      case 'contributor':
        return {
          canRead: true,
          canWrite: true,
          canDelete: false,
          canManageAssignees: false,
          canTransitionState: true,
        };
      case 'viewer':
        return {
          canRead: true,
          canWrite: false,
          canDelete: false,
          canManageAssignees: false,
          canTransitionState: false,
        };
    }
  };

  // Check if user has sufficient role level
  const hasRequiredRole = (userRole: TenderRole, requiredRole: TenderRole): boolean => {
    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  };

  // Get user's role for a specific tender
  fastify.decorate('getTenderRole', async function (userId: string, tenderId: string): Promise<TenderRole | null> {
    try {
      const assignment = await prisma.tenderAssignment.findUnique({
        where: {
          tenderId_userId: {
            tenderId,
            userId,
          },
        },
        select: { role: true },
      });

      return assignment?.role as TenderRole || null;
    } catch (error) {
      fastify.log.error(error, 'Error fetching tender role');
      return null;
    }
  });

  // Check specific permission for a user on a tender
  fastify.decorate('checkTenderPermission', async function (
    userId: string,
    tenderId: string,
    action: 'read' | 'write' | 'delete' | 'manage_assignees' | 'transition_state'
  ): Promise<boolean> {
    try {
      // Admin users bypass all checks
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (user?.role === 'admin') {
        return true;
      }

      // Get user's tender role
      const tenderRole = await fastify.getTenderRole(userId, tenderId);
      if (!tenderRole) {
        return false;
      }

      const permissions = getPermissions(tenderRole);

      switch (action) {
        case 'read':
          return permissions.canRead;
        case 'write':
          return permissions.canWrite;
        case 'delete':
          return permissions.canDelete;
        case 'manage_assignees':
          return permissions.canManageAssignees;
        case 'transition_state':
          return permissions.canTransitionState;
        default:
          return false;
      }
    } catch (error) {
      fastify.log.error(error, 'Error checking tender permission');
      return false;
    }
  });

  // Assign role to user for tender
  fastify.decorate('assignTenderRole', async function (
    userId: string,
    tenderId: string,
    role: TenderRole,
    assignedBy: string
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // Verify tender exists and user has permission to assign roles
        const tender = await tx.tender.findUnique({
          where: { id: tenderId },
          select: { id: true },
        });

        if (!tender) {
          throw new NotFoundError('Tender not found');
        }

        // Check if assigner has permission (owner or admin)
        const assignerRole = await fastify.getTenderRole(assignedBy, tenderId);
        const assignerUser = await tx.user.findUnique({
          where: { id: assignedBy },
          select: { role: true },
        });

        if (assignerUser?.role !== 'admin' && assignerRole !== 'owner') {
          throw new AuthorizationError('Only owners can assign roles');
        }

        // If assigning owner role, demote existing owner
        if (role === 'owner') {
          await fastify.enforceOwnershipTransfer(tenderId, userId);
        }

        // Upsert the assignment
        await tx.tenderAssignment.upsert({
          where: {
            tenderId_userId: {
              tenderId,
              userId,
            },
          },
          update: { role },
          create: {
            tenderId,
            userId,
            role,
          },
        });

        fastify.log.info(
          {
            userId,
            tenderId,
            role,
            assignedBy,
          },
          'Tender role assigned'
        );
      });
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Error assigning tender role');
      throw new Error('Failed to assign tender role');
    }
  });

  // Revoke user's role for tender
  fastify.decorate('revokeTenderRole', async function (userId: string, tenderId: string): Promise<void> {
    try {
      await prisma.tenderAssignment.delete({
        where: {
          tenderId_userId: {
            tenderId,
            userId,
          },
        },
      });

      fastify.log.info(
        {
          userId,
          tenderId,
        },
        'Tender role revoked'
      );
    } catch (error) {
      fastify.log.error(error, 'Error revoking tender role');
      throw new Error('Failed to revoke tender role');
    }
  });

  // Enforce single owner constraint
  fastify.decorate('enforceOwnershipTransfer', async function (tenderId: string, newOwnerId: string): Promise<void> {
    try {
      // Demote existing owners to contributors
      await prisma.tenderAssignment.updateMany({
        where: {
          tenderId,
          role: 'owner',
        },
        data: {
          role: 'contributor',
        },
      });

      fastify.log.info(
        {
          tenderId,
          newOwnerId,
        },
        'Ownership transferred'
      );
    } catch (error) {
      fastify.log.error(error, 'Error transferring ownership');
      throw new Error('Failed to transfer ownership');
    }
  });

  // Basic tender validation middleware
  fastify.decorate('requireTender', async function (request: FastifyRequest, reply: any) {
    if (!request.user) {
      throw new AuthorizationError('Authentication required');
    }

    const tenderId = (request.params as any)?.id || 
                    (request.body as any)?.tenderId;

    if (!tenderId) {
      throw new AuthorizationError('Tender ID required');
    }

    // Verify tender exists and belongs to tenant
    const tender = await prisma.tender.findUnique({
      where: { id: tenderId },
      select: { tenantId: true, deletedAt: true },
    });

    if (!tender || tender.deletedAt) {
      throw new NotFoundError('Tender not found');
    }

    if (tender.tenantId !== request.user.tenantId) {
      throw new AuthorizationError('Tender not accessible');
    }
  });

  // Middleware factory for role-based access control
  fastify.decorate('requireTenderRole', function (
    tenderId: string | 'param:id',
    requiredRole: TenderRole | TenderRole[]
  ) {
    return async (request: FastifyRequest, reply: any) => {
      if (!request.user) {
        throw new AuthorizationError('Authentication required');
      }

      // Resolve tender ID from parameter if needed
      const resolvedTenderId = tenderId === 'param:id' 
        ? (request.params as any).id 
        : tenderId;

      if (!resolvedTenderId) {
        throw new AuthorizationError('Tender ID required');
      }

      // Admin users bypass role checks
      const user = await prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { role: true },
      });

      if (user?.role === 'admin') {
        request.tenderRole = 'owner'; // Treat admin as owner
        request.tenderPermissions = {
          tenderId: resolvedTenderId,
          role: 'owner',
          ...getPermissions('owner'),
        };
        return;
      }

      // Get user's role for this tender
      const userTenderRole = await fastify.getTenderRole(request.user.userId, resolvedTenderId);
      
      if (!userTenderRole) {
        throw new AuthorizationError('No access to this tender');
      }

      // Check if user has required role
      const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      const hasAccess = requiredRoles.some(role => hasRequiredRole(userTenderRole, role));

      if (!hasAccess) {
        throw new AuthorizationError(
          `Insufficient permissions. Required: ${requiredRoles.join(' or ')}, has: ${userTenderRole}`
        );
      }

      // Add role info to request
      request.tenderRole = userTenderRole;
      request.tenderPermissions = {
        tenderId: resolvedTenderId,
        role: userTenderRole,
        ...getPermissions(userTenderRole),
      };

      fastify.log.debug(
        {
          userId: request.user.userId,
          tenderId: resolvedTenderId,
          role: userTenderRole,
        },
        'Tender access granted'
      );
    };
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default fp(aclPlugin, {
  name: 'acl',
  dependencies: ['error-handler', 'jwt', 'tenant'],
});