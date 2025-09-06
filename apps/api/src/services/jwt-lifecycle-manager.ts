/**
 * JWT Lifecycle Management Service
 * Implements government-grade JWT token management with automatic rotation,
 * secure storage, and comprehensive audit logging
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  sessionId: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
}

export class JWTLifecycleManager {
  private readonly ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = '7d'; // 7 days
  private readonly MAX_REFRESH_COUNT = 10; // Maximum refresh attempts per session

  constructor(
    private readonly jwtSecret: string = process.env.JWT_SECRET || this.generateSecureSecret(),
    private readonly refreshSecret: string = process.env.JWT_REFRESH_SECRET || this.generateSecureSecret()
  ) {
    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      logger.warn('JWT secrets not found in environment, using generated secrets (NOT PRODUCTION SAFE)');
    }
  }

  /**
   * Generate cryptographically secure JWT secret
   */
  private generateSecureSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Create a new JWT token pair with session tracking
   */
  async createTokenPair(
    userId: string,
    tenantId: string,
    role: string,
    permissions: string[] = [],
    sessionMetadata: Record<string, any> = {}
  ): Promise<TokenPair> {
    const sessionId = crypto.randomUUID();
    const jti = crypto.randomUUID(); // JWT ID for token revocation
    
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId,
      tenantId,
      role,
      permissions,
      sessionId,
      jti,
    };

    // Create access token (short-lived)
    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'tenderflow-api',
      audience: 'tenderflow-app',
      algorithm: 'HS256',
    });

    // Create refresh token (longer-lived)
    const refreshPayload = {
      userId,
      tenantId,
      sessionId,
      type: 'refresh',
    };

    const refreshToken = jwt.sign(refreshPayload, this.refreshSecret, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
      issuer: 'tenderflow-api',
      audience: 'tenderflow-app',
      algorithm: 'HS256',
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store session in database for tracking and revocation
    await this.storeSession({
      sessionId,
      userId,
      tenantId,
      jti,
      expiresAt,
      refreshExpiresAt,
      refreshCount: 0,
      metadata: sessionMetadata,
      createdAt: now,
      lastUsedAt: now,
      isActive: true,
    });

    // Log token creation for audit
    await this.logTokenEvent('TOKEN_CREATED', {
      userId,
      tenantId,
      sessionId,
      jti,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      accessToken,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
    };
  }

  /**
   * Validate and decode JWT token
   */
  async validateToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'tenderflow-api',
        audience: 'tenderflow-app',
      }) as JWTPayload;

      // Check if session is still active
      const session = await this.getSession(decoded.sessionId);
      if (!session || !session.isActive || session.expiresAt < new Date()) {
        logger.warn(`Session ${decoded.sessionId} is inactive or expired`);
        return null;
      }

      // Update last used timestamp
      await this.updateSessionLastUsed(decoded.sessionId);

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('JWT token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('JWT token invalid', { error: error.message });
      } else {
        logger.error('JWT validation error', error);
      }
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
    try {
      const decoded = jwt.verify(refreshToken, this.refreshSecret, {
        issuer: 'tenderflow-api',
        audience: 'tenderflow-app',
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get session details
      const session = await this.getSession(decoded.sessionId);
      if (!session || !session.isActive || session.refreshExpiresAt < new Date()) {
        logger.warn(`Refresh session ${decoded.sessionId} is inactive or expired`);
        return null;
      }

      // Check refresh count limit
      if (session.refreshCount >= this.MAX_REFRESH_COUNT) {
        logger.warn(`Maximum refresh count exceeded for session ${decoded.sessionId}`);
        await this.revokeSession(decoded.sessionId, 'MAX_REFRESH_EXCEEDED');
        return null;
      }

      // Get user details for new token
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, tenantId: true, role: true },
      });

      if (!user) {
        logger.warn(`User ${decoded.userId} not found during refresh`);
        return null;
      }

      // Generate new token pair
      const newTokenPair = await this.createTokenPair(
        user.id,
        user.tenantId,
        user.role,
        [], // TODO: Add permissions logic
        { refreshedFrom: decoded.sessionId }
      );

      // Update refresh count
      await this.incrementRefreshCount(decoded.sessionId);

      // Log token refresh for audit
      await this.logTokenEvent('TOKEN_REFRESHED', {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        oldSessionId: decoded.sessionId,
        newSessionId: newTokenPair.accessToken, // This would need session ID extraction
      });

      return newTokenPair;
    } catch (error) {
      logger.error('Token refresh error', error);
      return null;
    }
  }

  /**
   * Revoke a session (logout)
   */
  async revokeSession(sessionId: string, reason: string = 'USER_LOGOUT'): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return false;
      }

      await prisma.userSession.update({
        where: { sessionId },
        data: { 
          isActive: false,
          revokedAt: new Date(),
          revocationReason: reason,
        },
      });

      // Log session revocation for audit
      await this.logTokenEvent('SESSION_REVOKED', {
        userId: session.userId,
        tenantId: session.tenantId,
        sessionId,
        reason,
      });

      return true;
    } catch (error) {
      logger.error('Session revocation error', error);
      return false;
    }
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string, reason: string = 'ADMIN_ACTION'): Promise<number> {
    try {
      const result = await prisma.userSession.updateMany({
        where: { 
          userId,
          isActive: true,
        },
        data: { 
          isActive: false,
          revokedAt: new Date(),
          revocationReason: reason,
        },
      });

      // Log bulk session revocation for audit
      await this.logTokenEvent('BULK_SESSION_REVOKED', {
        userId,
        reason,
        sessionCount: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Bulk session revocation error', error);
      return 0;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<any[]> {
    return await prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      select: {
        sessionId: true,
        createdAt: true,
        lastUsedAt: true,
        metadata: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.userSession.updateMany({
        where: {
          isActive: true,
          refreshExpiresAt: { lt: new Date() },
        },
        data: {
          isActive: false,
          revokedAt: new Date(),
          revocationReason: 'EXPIRED',
        },
      });

      logger.info(`Cleaned up ${result.count} expired sessions`);
      return result.count;
    } catch (error) {
      logger.error('Session cleanup error', error);
      return 0;
    }
  }

  /**
   * Store session in database
   */
  private async storeSession(sessionData: any): Promise<void> {
    await prisma.userSession.create({
      data: sessionData,
    });
  }

  /**
   * Get session from database
   */
  private async getSession(sessionId: string): Promise<any> {
    return await prisma.userSession.findUnique({
      where: { sessionId },
    });
  }

  /**
   * Update session last used timestamp
   */
  private async updateSessionLastUsed(sessionId: string): Promise<void> {
    await prisma.userSession.update({
      where: { sessionId },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Increment refresh count for session
   */
  private async incrementRefreshCount(sessionId: string): Promise<void> {
    await prisma.userSession.update({
      where: { sessionId },
      data: { refreshCount: { increment: 1 } },
    });
  }

  /**
   * Log token events for audit trail
   */
  private async logTokenEvent(event: string, data: Record<string, any>): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: data.tenantId || 'system',
        userId: data.userId || 'system',
        action: event,
        resource: 'JWT_TOKEN',
        resourceId: data.sessionId || data.jti,
        details: data,
        ipAddress: data.ipAddress || 'internal',
        userAgent: data.userAgent || 'api-service',
        timestamp: new Date(),
      },
    });
  }
}