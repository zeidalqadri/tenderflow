/**
 * GCP Secret Manager Integration Service
 * Provides secure credential management with automatic rotation,
 * caching, and audit logging for government compliance
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';

export interface SecretMetadata {
  id: string;
  name: string;
  version: string;
  createdAt: Date;
  rotationSchedule?: string;
  lastRotated?: Date;
  nextRotation?: Date;
}

export interface SecretValue {
  value: string;
  metadata: SecretMetadata;
  cached: boolean;
  expiresAt?: Date;
}

export class SecretManager {
  private client: SecretManagerServiceClient;
  private cache = new Map<string, { value: string; expiresAt: Date; metadata: SecretMetadata }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
  private readonly projectId: string;

  constructor(projectId?: string) {
    this.projectId = projectId || process.env.GCP_PROJECT_ID || 'tensurv';
    
    // Initialize GCP Secret Manager client
    this.client = new SecretManagerServiceClient({
      projectId: this.projectId,
      // Use ADC (Application Default Credentials) for authentication
    });

    // Start cache cleanup interval
    setInterval(() => this.cleanupExpiredCache(), 60000); // Every minute
  }

  /**
   * Get secret value with caching and validation
   */
  async getSecret(secretName: string, useCache: boolean = true): Promise<string | null> {
    try {
      // Check cache first
      if (useCache) {
        const cached = this.getCachedSecret(secretName);
        if (cached) {
          await this.logSecretAccess(secretName, 'CACHE_HIT', true);
          return cached.value;
        }
      }

      // Fetch from GCP Secret Manager
      const secretPath = `projects/${this.projectId}/secrets/${secretName}/versions/latest`;
      
      const [version] = await this.client.accessSecretVersion({
        name: secretPath,
      });

      if (!version.payload?.data) {
        logger.error(`Secret ${secretName} has no payload data`);
        await this.logSecretAccess(secretName, 'NO_PAYLOAD', false);
        return null;
      }

      const secretValue = version.payload.data.toString();
      
      // Validate secret value
      if (!this.validateSecretValue(secretName, secretValue)) {
        logger.error(`Secret ${secretName} failed validation`);
        await this.logSecretAccess(secretName, 'VALIDATION_FAILED', false);
        return null;
      }

      // Create metadata
      const metadata: SecretMetadata = {
        id: version.name?.split('/')[5] || 'unknown',
        name: secretName,
        version: version.name?.split('/')[7] || 'latest',
        createdAt: version.createTime?.seconds ? 
          new Date(Number(version.createTime.seconds) * 1000) : new Date(),
      };

      // Cache the secret
      if (useCache) {
        this.cacheSecret(secretName, secretValue, metadata);
      }

      await this.logSecretAccess(secretName, 'FETCH_SUCCESS', true);
      return secretValue;

    } catch (error) {
      logger.error(`Failed to fetch secret ${secretName}:`, error);
      await this.logSecretAccess(secretName, 'FETCH_ERROR', false, { error: error.message });
      return null;
    }
  }

  /**
   * Create or update a secret in GCP Secret Manager
   */
  async createSecret(
    secretName: string, 
    secretValue: string, 
    rotationSchedule?: string
  ): Promise<boolean> {
    try {
      const parent = `projects/${this.projectId}`;
      const secretId = secretName;

      // First, try to create the secret metadata
      try {
        await this.client.createSecret({
          parent,
          secretId,
          secret: {
            replication: {
              automatic: {},
            },
            ...(rotationSchedule && {
              rotation: {
                rotationPeriod: this.parseRotationSchedule(rotationSchedule),
              },
            }),
          },
        });

        logger.info(`Created secret ${secretName}`);
      } catch (error) {
        // Secret might already exist, which is fine
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }

      // Add the secret version
      const secretPath = `projects/${this.projectId}/secrets/${secretName}`;
      
      await this.client.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(secretValue),
        },
      });

      // Invalidate cache
      this.cache.delete(secretName);

      await this.logSecretAccess(secretName, 'CREATE_SUCCESS', true);
      logger.info(`Successfully created/updated secret ${secretName}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to create secret ${secretName}:`, error);
      await this.logSecretAccess(secretName, 'CREATE_ERROR', false, { error: error.message });
      return false;
    }
  }

  /**
   * Rotate a secret with the provided new value
   */
  async rotateSecret(secretName: string, newSecretValue: string): Promise<boolean> {
    try {
      // Validate the new secret value
      if (!this.validateSecretValue(secretName, newSecretValue)) {
        logger.error(`New secret value for ${secretName} failed validation`);
        return false;
      }

      // Add new version
      const secretPath = `projects/${this.projectId}/secrets/${secretName}`;
      
      await this.client.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(newSecretValue),
        },
      });

      // Invalidate cache to force refresh
      this.cache.delete(secretName);

      await this.logSecretAccess(secretName, 'ROTATE_SUCCESS', true);
      logger.info(`Successfully rotated secret ${secretName}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to rotate secret ${secretName}:`, error);
      await this.logSecretAccess(secretName, 'ROTATE_ERROR', false, { error: error.message });
      return false;
    }
  }

  /**
   * Delete a secret (mark as inactive)
   */
  async deleteSecret(secretName: string): Promise<boolean> {
    try {
      const secretPath = `projects/${this.projectId}/secrets/${secretName}`;
      
      await this.client.deleteSecret({
        name: secretPath,
      });

      // Remove from cache
      this.cache.delete(secretName);

      await this.logSecretAccess(secretName, 'DELETE_SUCCESS', true);
      logger.info(`Successfully deleted secret ${secretName}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to delete secret ${secretName}:`, error);
      await this.logSecretAccess(secretName, 'DELETE_ERROR', false, { error: error.message });
      return false;
    }
  }

  /**
   * List all secrets in the project
   */
  async listSecrets(): Promise<SecretMetadata[]> {
    try {
      const parent = `projects/${this.projectId}`;
      const [secrets] = await this.client.listSecrets({ parent });

      const metadata: SecretMetadata[] = secrets.map(secret => ({
        id: secret.name?.split('/')[3] || 'unknown',
        name: secret.name?.split('/')[3] || 'unknown',
        version: 'latest',
        createdAt: secret.createTime?.seconds ? 
          new Date(Number(secret.createTime.seconds) * 1000) : new Date(),
      }));

      return metadata;
    } catch (error) {
      logger.error('Failed to list secrets:', error);
      return [];
    }
  }

  /**
   * Get multiple secrets in batch with fallback values
   */
  async getSecretsWithFallback(secretConfig: Record<string, string>): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    
    for (const [key, secretName] of Object.entries(secretConfig)) {
      // First try to get from GCP Secret Manager
      let value = await this.getSecret(secretName);
      
      // Fallback to environment variable
      if (!value) {
        value = process.env[secretName] || process.env[key];
        if (value) {
          logger.warn(`Using environment variable fallback for secret ${secretName}`);
        }
      }

      if (value) {
        result[key] = value;
      } else {
        logger.error(`Failed to get secret or fallback for ${secretName}`);
      }
    }

    return result;
  }

  /**
   * Initialize application secrets with validation
   */
  async initializeApplicationSecrets(): Promise<Record<string, string>> {
    const secretsConfig = {
      JWT_SECRET: 'jwt-secret',
      JWT_REFRESH_SECRET: 'jwt-refresh-secret',
      DATABASE_URL: 'database-url',
      REDIS_PASSWORD: 'redis-auth',
      SUPABASE_PASSWORD: 'supabase-password',
      ENCRYPTION_KEY: 'data-encryption-key',
    };

    const secrets = await this.getSecretsWithFallback(secretsConfig);

    // Validate that critical secrets are present
    const criticalSecrets = ['JWT_SECRET', 'DATABASE_URL'];
    for (const secret of criticalSecrets) {
      if (!secrets[secret]) {
        throw new Error(`Critical secret ${secret} is missing`);
      }
    }

    // Generate missing non-critical secrets
    if (!secrets.JWT_REFRESH_SECRET) {
      const refreshSecret = crypto.randomBytes(64).toString('hex');
      await this.createSecret('jwt-refresh-secret', refreshSecret);
      secrets.JWT_REFRESH_SECRET = refreshSecret;
    }

    if (!secrets.ENCRYPTION_KEY) {
      const encryptionKey = crypto.randomBytes(32).toString('hex');
      await this.createSecret('data-encryption-key', encryptionKey);
      secrets.ENCRYPTION_KEY = encryptionKey;
    }

    return secrets;
  }

  /**
   * Cache a secret value
   */
  private cacheSecret(secretName: string, value: string, metadata: SecretMetadata): void {
    const expiresAt = new Date(Date.now() + this.CACHE_TTL);
    this.cache.set(secretName, { value, expiresAt, metadata });
  }

  /**
   * Get cached secret if still valid
   */
  private getCachedSecret(secretName: string): { value: string; metadata: SecretMetadata } | null {
    const cached = this.cache.get(secretName);
    if (!cached) return null;

    if (cached.expiresAt < new Date()) {
      this.cache.delete(secretName);
      return null;
    }

    return cached;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = new Date();
    let cleaned = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired secret cache entries`);
    }
  }

  /**
   * Validate secret value format and strength
   */
  private validateSecretValue(secretName: string, value: string): boolean {
    if (!value || value.length === 0) {
      return false;
    }

    // JWT secrets should be at least 32 characters
    if (secretName.includes('jwt') && value.length < 32) {
      logger.warn(`JWT secret ${secretName} is too short (${value.length} chars)`);
      return false;
    }

    // Database URLs should start with postgresql://
    if (secretName.includes('database') && !value.startsWith('postgresql://')) {
      logger.warn(`Database URL ${secretName} has invalid format`);
      return false;
    }

    return true;
  }

  /**
   * Parse rotation schedule string to protobuf Duration
   */
  private parseRotationSchedule(schedule: string): any {
    // Simple implementation - convert common formats
    const match = schedule.match(/(\d+)([dhm])/);
    if (!match) return null;

    const [, value, unit] = match;
    const seconds = {
      'm': parseInt(value) * 60,
      'h': parseInt(value) * 3600,
      'd': parseInt(value) * 86400,
    }[unit];

    return { seconds: seconds?.toString() };
  }

  /**
   * Log secret access events for audit trail
   */
  private async logSecretAccess(
    secretName: string, 
    action: string, 
    success: boolean,
    details: Record<string, any> = {}
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: 'system',
          userId: 'secret-manager',
          action: `SECRET_${action}`,
          resource: 'SECRET',
          resourceId: secretName,
          details: {
            secretName,
            success,
            projectId: this.projectId,
            ...details,
          },
          ipAddress: 'internal',
          userAgent: 'secret-manager-service',
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to log secret access:', error);
    }
  }
}

// Export singleton instance
export const secretManager = new SecretManager();