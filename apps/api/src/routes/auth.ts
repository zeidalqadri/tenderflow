// Authentication routes for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '../generated/prisma';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  LoginSchema,
  RefreshTokenSchema,
  RegisterSchema,
  PasswordResetSchema,
  PasswordResetConfirmSchema,
  ApiResponseSchema,
  UserBaseSchema,
} from '../schemas';
import { 
  AuthenticationError, 
  ValidationError, 
  ConflictError,
  NotFoundError 
} from '../plugins/error-handler';

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();

  // Login endpoint
  fastify.post('/login', {
    schema: {
      description: 'Authenticate user and return JWT tokens',
      tags: ['Authentication'],
      body: zodToJsonSchema(LoginSchema),
      response: {
        200: zodToJsonSchema(ApiResponseSchema(z.object({
          user: UserBaseSchema,
          accessToken: z.string(),
          refreshToken: z.string(),
        }))),
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, tenantId } = request.body as any;

    try {
      // Find user by email and optional tenant
      const whereClause: any = { email };
      if (tenantId) {
        whereClause.tenantId = tenantId;
      }

      const user = await prisma.user.findFirst({
        where: whereClause,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              isActive: true,
            },
          },
        },
      });

      if (!user) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Check if tenant is active
      if (!user.tenant.isActive) {
        throw new AuthenticationError('Account is suspended');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new AuthenticationError('User account is disabled');
      }

      // Verify password hash
      if (!user.passwordHash) {
        throw new AuthenticationError('Account setup incomplete. Please contact administrator.');
      }
      
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Generate JWT tokens
      const tokenPayload = {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      };

      const tokens = await fastify.generateTokens(tokenPayload);

      // Update last login time
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Audit log
      await fastify.audit({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'LOGIN',
        resource: 'auth',
        resourceId: user.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            isActive: user.isActive,
            lastLoginAt: user.lastLoginAt,
            settings: user.settings,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      fastify.log.error(error, 'Login error');
      throw new AuthenticationError('Authentication failed');
    }
  });

  // Token refresh endpoint
  fastify.post('/refresh', {
    schema: {
      description: 'Refresh access token using refresh token',
      tags: ['Authentication'],
      body: zodToJsonSchema(RefreshTokenSchema),
      response: {
        200: zodToJsonSchema(ApiResponseSchema(z.object({
          accessToken: z.string(),
          refreshToken: z.string(),
        }))),
      },
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body as any;

    try {
      // Verify refresh token
      const payload = await fastify.verifyRefreshToken(refreshToken);

      // Check if user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          tenant: {
            select: { isActive: true },
          },
        },
      });

      if (!user || !user.isActive || !user.tenant.isActive) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Generate new tokens
      const tokenPayload = {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      };

      const tokens = await fastify.generateTokens(tokenPayload);

      return reply.send({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    } catch (error) {
      throw new AuthenticationError('Invalid refresh token');
    }
  });

  // Logout endpoint
  fastify.post('/logout', {
    schema: {
      description: 'Logout user (invalidate tokens)',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      response: {
        200: zodToJsonSchema(ApiResponseSchema(z.object({
          message: z.string(),
        }))),
      },
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    // In a full implementation, you would invalidate the tokens
    // This might involve blacklisting them in Redis or incrementing a token version

    // Audit log
    await fastify.audit({
      tenantId: request.user!.tenantId,
      userId: request.user!.userId,
      action: 'LOGOUT',
      resource: 'auth',
      resourceId: request.user!.userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: {
        message: 'Logged out successfully',
      },
    });
  });

  // Register endpoint (creates tenant and first user)
  fastify.post('/register', {
    schema: {
      description: 'Register new tenant and admin user',
      tags: ['Authentication'],
      body: zodToJsonSchema(RegisterSchema),
      response: {
        201: zodToJsonSchema(ApiResponseSchema(z.object({
          user: UserBaseSchema,
          tenant: z.object({
            id: z.string(),
            name: z.string(),
            subdomain: z.string(),
          }),
          accessToken: z.string(),
          refreshToken: z.string(),
        }))),
      },
    },
  }, async (request, reply) => {
    const { email, password, firstName, lastName, tenantName, tenantSubdomain } = request.body as any;

    try {
      // Check if email already exists
      const existingUser = await prisma.user.findFirst({
        where: { email },
      });

      if (existingUser) {
        throw new ConflictError('Email already registered');
      }

      // Check if subdomain is available
      const existingTenant = await prisma.tenant.findUnique({
        where: { subdomain: tenantSubdomain },
      });

      if (existingTenant) {
        throw new ConflictError('Subdomain already taken');
      }

      // Hash password securely
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create tenant and user in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: tenantName,
            subdomain: tenantSubdomain,
            settings: {},
          },
        });

        // Create admin user
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            passwordHash: hashedPassword,
            firstName,
            lastName,
            role: 'admin',
            isActive: true,
            settings: {},
          },
        });

        return { tenant, user };
      });

      // Generate JWT tokens
      const tokenPayload = {
        userId: result.user.id,
        tenantId: result.tenant.id,
        role: result.user.role,
        email: result.user.email,
      };

      const tokens = await fastify.generateTokens(tokenPayload);

      // Audit log
      await fastify.audit({
        tenantId: result.tenant.id,
        userId: result.user.id,
        action: 'CREATE',
        resource: 'user',
        resourceId: result.user.id,
        newValues: {
          email: result.user.email,
          role: result.user.role,
          tenantId: result.tenant.id,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(201).send({
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            role: result.user.role,
            isActive: result.user.isActive,
            lastLoginAt: result.user.lastLoginAt,
            settings: result.user.settings,
            createdAt: result.user.createdAt,
            updatedAt: result.user.updatedAt,
          },
          tenant: {
            id: result.tenant.id,
            name: result.tenant.name,
            subdomain: result.tenant.subdomain,
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }
      fastify.log.error(error, 'Registration error');
      throw new ValidationError('Registration failed');
    }
  });

  // Password reset request
  fastify.post('/password/reset', {
    schema: {
      description: 'Request password reset',
      tags: ['Authentication'],
      body: zodToJsonSchema(PasswordResetSchema),
      response: {
        200: zodToJsonSchema(ApiResponseSchema(z.object({
          message: z.string(),
        }))),
      },
    },
  }, async (request, reply) => {
    const { email } = request.body as any;

    try {
      const user = await prisma.user.findFirst({
        where: { email },
        include: {
          tenant: true,
        },
      });

      if (!user) {
        // Don't reveal if email exists or not - return success anyway
        return reply.send({
          success: true,
          data: {
            message: 'If the email exists, a reset link has been sent',
          },
        });
      }

      // Generate a secure reset token (valid for 1 hour)
      const resetToken = await fastify.jwt.sign(
        { 
          userId: user.id, 
          purpose: 'password_reset',
          email: user.email 
        },
        { expiresIn: '1h' }
      );

      // Store reset token in user settings (in production, use dedicated table)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          settings: {
            ...((user.settings as any) || {}),
            passwordResetToken: resetToken,
            passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
          },
        },
      });

      // In production, send email with reset link containing the token
      fastify.log.info({ email }, 'Password reset token generated');

      return reply.send({
        success: true,
        data: {
          message: 'If the email exists, a reset link has been sent',
          // In development, return the token for testing
          ...(fastify.config.NODE_ENV === 'development' && { resetToken }),
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Password reset error');
      throw new ValidationError('Password reset request failed');
    }
  });

  // Password reset confirmation
  fastify.post('/password/reset/confirm', {
    schema: {
      description: 'Confirm password reset with token',
      tags: ['Authentication'],
      body: zodToJsonSchema(PasswordResetConfirmSchema),
      response: {
        200: zodToJsonSchema(ApiResponseSchema(z.object({
          message: z.string(),
        }))),
      },
    },
  }, async (request, reply) => {
    const { token, password } = request.body as any;

    try {
      // Verify the reset token
      const payload = await fastify.jwt.verify(token) as any;
      
      if (payload.purpose !== 'password_reset') {
        throw new NotFoundError('Invalid reset token');
      }

      // Find user and verify token matches
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      const userSettings = (user.settings as any) || {};
      if (!userSettings.passwordResetToken || 
          userSettings.passwordResetToken !== token ||
          new Date() > new Date(userSettings.passwordResetExpires)) {
        throw new NotFoundError('Invalid or expired reset token');
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Update password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          settings: {
            ...userSettings,
            passwordResetToken: null,
            passwordResetExpires: null,
          },
        },
      });

      // Audit log
      await fastify.audit({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'UPDATE',
        resource: 'user',
        resourceId: user.id,
        newValues: { passwordReset: true },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      fastify.log.info({ userId: user.id }, 'Password reset completed successfully');

      return reply.send({
        success: true,
        data: {
          message: 'Password reset successfully',
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      fastify.log.error(error, 'Password reset confirmation error');
      throw new ValidationError('Password reset failed');
    }
  });

  // Get current user info
  fastify.get('/me', {
    schema: {
      description: 'Get current authenticated user information',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      response: {
        200: zodToJsonSchema(ApiResponseSchema(UserBaseSchema.extend({
          tenant: z.object({
            id: z.string(),
            name: z.string(),
            subdomain: z.string(),
          }),
        }))),
      },
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.userId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return reply.send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        settings: user.settings,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        tenant: user.tenant,
      },
    });
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default authRoutes;