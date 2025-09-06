// JWT authentication plugin for TenderFlow API
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { AuthenticationError } from './error-handler';

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: 'admin' | 'member' | 'viewer';
  email: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

export interface RefreshPayload {
  userId: string;
  tenantId: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: any) => Promise<void>;
    generateTokens: (payload: Omit<JwtPayload, 'iat' | 'exp'>) => Promise<{
      accessToken: string;
      refreshToken: string;
    }>;
    verifyRefreshToken: (token: string) => Promise<RefreshPayload>;
    validateTokenVersion: (userId: string, tokenVersion: number) => Promise<boolean>;
  }

  interface FastifyRequest {
    user?: JwtPayload;
  }
}

interface JwtPluginOptions {
  secret: string;
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
}

const jwtPlugin: FastifyPluginAsync<JwtPluginOptions> = async (
  fastify: FastifyInstance,
  options
) => {
  const {
    secret,
    accessTokenExpiry = '15m',
    refreshTokenExpiry = '7d',
  } = options;

  // Register JWT plugin
  await fastify.register(jwt, {
    secret,
    sign: {
      expiresIn: accessTokenExpiry,
    },
    verify: {
      maxAge: accessTokenExpiry,
    },
  });

  // Generate both access and refresh tokens with proper versioning
  fastify.decorate('generateTokens', async function (payload: Omit<JwtPayload, 'iat' | 'exp'>) {
    // Access tokens now include token version for revocation capability
    const accessTokenPayload = {
      ...payload,
      tokenVersion: payload.tokenVersion || 1, // Default version 1 for new tokens
    };
    
    const accessToken = await this.jwt.sign(accessTokenPayload, { expiresIn: accessTokenExpiry });
    
    const refreshPayload: Omit<RefreshPayload, 'iat' | 'exp'> = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      tokenVersion: payload.tokenVersion || 1, // Use same version for refresh token
    };
    
    const refreshToken = await this.jwt.sign(refreshPayload, { 
      expiresIn: refreshTokenExpiry,
      // Use different secret for refresh tokens for added security
      secret: process.env.JWT_REFRESH_SECRET || secret
    });

    return { accessToken, refreshToken };
  });

  // Verify refresh token with dedicated secret
  fastify.decorate('verifyRefreshToken', async function (token: string): Promise<RefreshPayload> {
    try {
      const refreshSecret = process.env.JWT_REFRESH_SECRET || secret;
      const payload = await this.jwt.verify(token, { secret: refreshSecret }) as RefreshPayload;
      
      // Validate token version if validation is enabled
      if (fastify.validateTokenVersion) {
        const isValidVersion = await fastify.validateTokenVersion(payload.userId, payload.tokenVersion);
        if (!isValidVersion) {
          throw new AuthenticationError('Token has been revoked');
        }
      }
      
      return payload;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      fastify.log.error(error, 'Refresh token verification failed');
      throw new AuthenticationError('Invalid refresh token');
    }
  });

  // Authentication decorator
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: any) {
    try {
      // Check for Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        throw new AuthenticationError('Authorization header required');
      }

      // Validate Bearer format
      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) {
        throw new AuthenticationError('Invalid authorization format. Use: Bearer <token>');
      }

      // Verify JWT token
      const payload = await fastify.jwt.verify(token) as JwtPayload;
      
      // Validate payload structure
      if (!payload.userId || !payload.tenantId || !payload.role || !payload.email) {
        throw new AuthenticationError('Invalid token payload');
      }

      // Validate token version for revocation capability
      if (fastify.validateTokenVersion && payload.tokenVersion) {
        const isValidVersion = await fastify.validateTokenVersion(payload.userId, payload.tokenVersion);
        if (!isValidVersion) {
          throw new AuthenticationError('Token has been revoked');
        }
      }

      // Add user to request
      request.user = payload;

      fastify.log.debug(
        {
          userId: payload.userId,
          tenantId: payload.tenantId,
          role: payload.role,
        },
        'User authenticated'
      );
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      // Handle JWT verification errors
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid token');
      } else if (error.name === 'NotBeforeError') {
        throw new AuthenticationError('Token not active yet');
      }

      fastify.log.error(error, 'JWT verification error');
      throw new AuthenticationError('Authentication failed');
    }
  });

  // Token version validation for revocation capability
  fastify.decorate('validateTokenVersion', async function (userId: string, tokenVersion: number): Promise<boolean> {
    try {
      // Validate input parameters
      if (!userId || !tokenVersion || tokenVersion < 1) {
        fastify.log.warn({ userId, tokenVersion }, 'Invalid token version parameters');
        return false;
      }
      
      // Import Prisma client for database lookup
      const { prisma } = await import('../database/client');
      
      // Query database to verify user's current token version
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          tokenVersion: true,
          isActive: true 
        }
      });
      
      // Check if user exists and is active
      if (!user || !user.isActive) {
        fastify.log.warn({ userId }, 'User not found or inactive');
        return false;
      }
      
      // Verify token version matches current user version
      if (user.tokenVersion !== tokenVersion) {
        fastify.log.warn({ 
          userId, 
          tokenVersion, 
          expectedVersion: user.tokenVersion 
        }, 'Token version mismatch - token has been revoked');
        return false;
      }
      
      return true;
    } catch (error) {
      fastify.log.error(error, 'Token version validation failed');
      return false;
    }
  });

  // Optional authentication decorator (doesn't throw on missing token)
  fastify.decorate('optionalAuthenticate', async function (request: FastifyRequest, reply: any) {
    try {
      await fastify.authenticate(request, reply);
    } catch (error) {
      // Don't throw, just log and continue
      fastify.log.debug('Optional authentication failed, continuing without user');
      request.user = undefined;
    }
  });

  // Hook to automatically authenticate routes with security requirement
  fastify.addHook('preHandler', async (request, reply) => {
    const routeConfig = request.routeConfig;
    
    // Skip authentication for health checks and auth routes
    if (request.url.startsWith('/health') || 
        request.url.startsWith('/api/v1/auth') ||
        request.url.startsWith('/docs')) {
      return;
    }

    // Check if route requires authentication
    if (routeConfig.schema?.security) {
      await fastify.authenticate(request, reply);
    }
  });
};

export default fp(jwtPlugin, {
  name: 'jwt',
  dependencies: ['error-handler'],
});