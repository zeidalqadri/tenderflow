import { Prisma } from '../generated/prisma';
import { prisma, transaction } from './client';
import { createLogger, logError, logWarning, logInfo, logSuccess } from '../utils/logger';

const logger = createLogger('DATABASE_UTILS');

// Error handling utilities
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public meta?: any
  ) {
    super(message);
    this.name = 'DatabaseError';
  }

  static fromPrismaError(error: unknown): DatabaseError {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          return new DatabaseError(
            'A record with this value already exists',
            'UNIQUE_CONSTRAINT_VIOLATION',
            error.meta
          );
        case 'P2025':
          return new DatabaseError(
            'Record not found',
            'RECORD_NOT_FOUND',
            error.meta
          );
        case 'P2003':
          return new DatabaseError(
            'Foreign key constraint violation',
            'FOREIGN_KEY_VIOLATION',
            error.meta
          );
        case 'P2016':
          return new DatabaseError(
            'Query interpretation error',
            'QUERY_INTERPRETATION_ERROR',
            error.meta
          );
        default:
          return new DatabaseError(
            error.message,
            error.code,
            error.meta
          );
      }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return new DatabaseError(
        'Validation error: Invalid data provided',
        'VALIDATION_ERROR'
      );
    }

    if (error instanceof Prisma.PrismaClientRustPanicError) {
      return new DatabaseError(
        'Database engine panic',
        'ENGINE_PANIC'
      );
    }

    return new DatabaseError(
      error instanceof Error ? error.message : 'Unknown database error',
      'UNKNOWN_ERROR'
    );
  }
}

// Soft delete utilities
export class SoftDelete {
  static async softDelete(model: string, id: string, userId: string) {
    try {
      return await transaction(async (tx) => {
        // Update the record with deletedAt timestamp
        const updated = await (tx as any)[model].update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            tenantId: updated.tenantId,
            userId,
            action: 'DELETE',
            resource: model,
            resourceId: id,
            oldValues: { deletedAt: null },
            newValues: { deletedAt: updated.deletedAt },
            metadata: { softDelete: true },
          },
        });

        return updated;
      });
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  static async restore(model: string, id: string, userId: string) {
    try {
      return await transaction(async (tx) => {
        // Restore the record by setting deletedAt to null
        const restored = await (tx as any)[model].update({
          where: { id },
          data: { deletedAt: null },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            tenantId: restored.tenantId,
            userId,
            action: 'UPDATE',
            resource: model,
            resourceId: id,
            oldValues: { deletedAt: restored.deletedAt },
            newValues: { deletedAt: null },
            metadata: { restore: true },
          },
        });

        return restored;
      });
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  static includeDeleted = { deletedAt: null };
  static onlyDeleted = { deletedAt: { not: null } };
}

// Tenant isolation utilities
export class TenantIsolation {
  static enforceFilter(tenantId: string) {
    return { tenantId };
  }

  static async validateTenantAccess(
    model: string, 
    resourceId: string, 
    tenantId: string
  ): Promise<boolean> {
    try {
      const resource = await (prisma as any)[model].findFirst({
        where: { 
          id: resourceId,
          tenantId,
        },
        select: { id: true },
      });

      return !!resource;
    } catch (error) {
      return false;
    }
  }

  static async getUserTenantId(userId: string): Promise<string | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { tenantId: true },
      });

      return user?.tenantId || null;
    } catch (error) {
      return null;
    }
  }
}

// Audit logging utilities
export class AuditLogger {
  static async logAction(
    tenantId: string,
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    oldValues?: any,
    newValues?: any,
    metadata?: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: action as any,
          resource,
          resourceId,
          oldValues: oldValues || {},
          newValues: newValues || {},
          metadata: metadata || {},
          ipAddress,
          userAgent,
        },
      });
    } catch (error) {
      // Audit logging should not break the main operation
      logError('AUDIT', 'Failed to create audit log', error as Error);
    }
  }

  static async logUserAction(
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    metadata?: any
  ) {
    const tenantId = await TenantIsolation.getUserTenantId(userId);
    if (tenantId) {
      await this.logAction(
        tenantId,
        userId,
        action,
        resource,
        resourceId,
        undefined,
        undefined,
        metadata
      );
    }
  }
}

// Search utilities
export class SearchUtils {
  static buildFullTextSearch(query: string, fields: string[]) {
    const searchTerms = query
      .split(' ')
      .filter(term => term.length > 2)
      .map(term => `'${term}':*`)
      .join(' & ');

    if (!searchTerms) return undefined;

    return {
      OR: fields.map(field => ({
        [field]: {
          search: searchTerms,
        },
      })),
    };
  }

  static buildFilterConditions(filters: Record<string, any>) {
    const conditions: any = {};

    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null) return;

      if (Array.isArray(value)) {
        conditions[key] = { in: value };
      } else if (typeof value === 'string' && value.includes('*')) {
        conditions[key] = { contains: value.replace(/\*/g, '') };
      } else if (typeof value === 'object' && value.from && value.to) {
        conditions[key] = { gte: value.from, lte: value.to };
      } else {
        conditions[key] = value;
      }
    });

    return conditions;
  }

  static buildSortConditions(
    sortBy?: string, 
    sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    if (!sortBy) {
      return { createdAt: 'desc' };
    }

    return { [sortBy]: sortOrder };
  }
}

// Validation utilities
export class ValidationUtils {
  static validateUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validateDateRange(startDate: Date, endDate: Date): boolean {
    return startDate < endDate;
  }

  static sanitizeInput(input: string): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .substring(0, 1000); // Limit length
  }
}

// Performance monitoring utilities
export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();

  static startTimer(label: string): void {
    this.timers.set(label, Date.now());
  }

  static endTimer(label: string): number {
    const startTime = this.timers.get(label);
    if (!startTime) return 0;

    const duration = Date.now() - startTime;
    this.timers.delete(label);
    
    // Log slow queries
    if (duration > 1000) {
      logWarning('PERFORMANCE', `Slow database operation: ${label} took ${duration}ms`);
    }

    return duration;
  }

  static async measureQuery<T>(
    label: string,
    queryFn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    this.startTimer(label);
    
    try {
      const result = await queryFn();
      const duration = this.endTimer(label);
      
      return { result, duration };
    } catch (error) {
      this.endTimer(label);
      throw error;
    }
  }
}

// Caching utilities (simple in-memory cache)
export class CacheUtils {
  private static cache: Map<string, { data: any; expires: number }> = new Map();

  static set(key: string, data: any, ttlSeconds: number = 300): void {
    const expires = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { data, expires });
  }

  static get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  static delete(key: string): void {
    this.cache.delete(key);
  }

  static clear(): void {
    this.cache.clear();
  }

  static async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached) return cached;

    const data = await fetchFn();
    this.set(key, data, ttlSeconds);
    return data;
  }

  // Cache keys helpers
  static keys = {
    user: (id: string) => `user:${id}`,
    tender: (id: string) => `tender:${id}`,
    tenantUsers: (tenantId: string) => `tenant:${tenantId}:users`,
    tenderAssignments: (tenderId: string) => `tender:${tenderId}:assignments`,
    systemConfig: () => 'system:config',
    stats: (type: string) => `stats:${type}`,
  };
}

// Migration utilities
export class MigrationUtils {
  static async runDataMigration<T>(
    migrationName: string,
    batchSize: number = 100,
    processor: (batch: T[]) => Promise<void>
  ) {
    // eslint-disable-next-line no-console
    console.log(`Starting migration: ${migrationName}`);
    
    let processed = 0;
    let hasMore = true;
    
    while (hasMore) {
      const batch = await (prisma as any).findMany({
        take: batchSize,
        skip: processed,
      });
      
      if (batch.length === 0) {
        hasMore = false;
        break;
      }
      
      await processor(batch);
      processed += batch.length;
      
      // eslint-disable-next-line no-console
      console.log(`Processed ${processed} records for ${migrationName}`);
    }
    
    // eslint-disable-next-line no-console
    console.log(`Migration completed: ${migrationName}. Total processed: ${processed}`);
  }

  static async backupData(tableName: string) {
    // SECURITY: Whitelist of allowed tables to prevent SQL injection
    const allowedTables = [
      'users',
      'tenants', 
      'tenders',
      'documents',
      'submissions',
      'bids',
      'audit_logs',
      'notifications',
      'tender_assignments'
    ];
    
    // Validate table name against whitelist
    if (!allowedTables.includes(tableName)) {
      throw new Error(`Invalid table name for backup: ${tableName}. Only allowed tables are: ${allowedTables.join(', ')}`);
    }
    
    // Additional validation: ensure table name contains only safe characters
    const safeTablePattern = /^[a-z_]+$/;
    if (!safeTablePattern.test(tableName)) {
      throw new Error('Table name contains invalid characters');
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${tableName}_backup_${timestamp}`;
    
    // Validate backup table name
    if (!safeTablePattern.test(backupName.split('_backup_')[0])) {
      throw new Error('Generated backup name is invalid');
    }
    
    try {
      // Use parameterized query with Prisma.sql for safe execution
      // Note: Table names cannot be parameterized in SQL, but we've validated above
      await prisma.$executeRawUnsafe(
        `CREATE TABLE ${backupName} AS SELECT * FROM ${tableName}`
      );
      // eslint-disable-next-line no-console
      console.log(`Backup created: ${backupName}`);
      return backupName;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to create backup for ${tableName}:`, error);
      throw error;
    }
  }
}

// Export all utilities
export {
  DatabaseError,
  SoftDelete,
  TenantIsolation,
  AuditLogger,
  SearchUtils,
  ValidationUtils,
  PerformanceMonitor,
  CacheUtils,
  MigrationUtils,
};