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

  // Generate both access and refresh tokens
  fastify.decorate('generateTokens', async function (payload: Omit<JwtPayload, 'iat' | 'exp'>) {
    const accessToken = await this.jwt.sign(payload, { expiresIn: accessTokenExpiry });
    
    const refreshPayload: Omit<RefreshPayload, 'iat' | 'exp'> = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      tokenVersion: 1, // TODO: Implement token versioning for security
    };
    
    const refreshToken = await this.jwt.sign(refreshPayload, { expiresIn: refreshTokenExpiry });

    return { accessToken, refreshToken };
  });

  // Verify refresh token
  fastify.decorate('verifyRefreshToken', async function (token: string): Promise<RefreshPayload> {
    try {
      const payload = await this.jwt.verify(token) as RefreshPayload;
      return payload;
    } catch (error) {
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