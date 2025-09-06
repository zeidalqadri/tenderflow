// Main database module exports
// This file serves as the main entry point for all database-related functionality

// Core client and utilities
export { prisma as default, prisma } from './client';
export {
  healthCheck,
  getConnectionInfo,
  getDatabaseStats,
  withRetry,
  transaction,
  BulkOperations,
  QueryOptimizer,
  DatabaseMaintenance,
} from './client';

// Utility classes
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
} from './utils';

// Type exports for common database operations
export type {
  Prisma,
  PrismaClient,
  Tenant,
  User,
  Tender,
  TenderAssignment,
  Bid,
  Document,
  Submission,
  TenderValidation,
  StateTransition,
  Comment,
  Notification,
  AuditLog,
  SystemConfig,
  JobQueue,
  ApiKey,
  TenderStatus,
  TenderCategory,
  UserRole,
  TenderRole,
  DocumentType,
  SubmissionMethod,
  NotificationType,
  AuditAction,
} from '../generated/prisma';

// Common query options and filters
export interface PaginationOptions {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface SortOptions {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterOptions {
  search?: string;
  status?: string | string[];
  category?: string | string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  [key: string]: any;
}

export interface QueryOptions extends PaginationOptions, SortOptions {
  filters?: FilterOptions;
  include?: Record<string, boolean | object>;
  select?: Record<string, boolean>;
}

// Common response types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface DatabaseHealth {
  status: 'healthy' | 'unhealthy';
  details?: string;
  connections?: {
    active: number;
    timestamp: Date;
  };
}

export interface DatabaseStats {
  tables: Array<{
    table_name: string;
    row_count: number;
  }>;
  indexes: Array<{
    table_name: string;
    index_name: string;
    index_scans: number;
  }>;
  connections: {
    activeConnections: number;
    timestamp: Date;
  } | null;
  timestamp: Date;
}

// Repository pattern interfaces (for future implementation)
export interface BaseRepository<T> {
  findById(id: string, options?: QueryOptions): Promise<T | null>;
  findMany(options?: QueryOptions): Promise<PaginatedResponse<T>>;
  create(data: any): Promise<T>;
  update(id: string, data: any): Promise<T>;
  delete(id: string): Promise<T>;
  softDelete?(id: string, userId: string): Promise<T>;
  restore?(id: string, userId: string): Promise<T>;
}

// Tenant-aware repository interface
export interface TenantRepository<T> extends BaseRepository<T> {
  findByIdWithTenant(id: string, tenantId: string, options?: QueryOptions): Promise<T | null>;
  findManyByTenant(tenantId: string, options?: QueryOptions): Promise<PaginatedResponse<T>>;
  createWithTenant(tenantId: string, data: any): Promise<T>;
  updateWithTenant(id: string, tenantId: string, data: any): Promise<T>;
  deleteWithTenant(id: string, tenantId: string): Promise<T>;
}

// Database configuration interface
export interface DatabaseConfig {
  url: string;
  poolSize?: number;
  connectionTimeout?: number;
  statementTimeout?: number;
  enableLogging?: boolean;
  logLevel?: 'query' | 'info' | 'warn' | 'error';
}

// Migration status interface
export interface MigrationStatus {
  applied: string[];
  pending: string[];
  lastApplied?: {
    name: string;
    appliedAt: Date;
  };
}

// Backup configuration
export interface BackupConfig {
  schedule?: string; // Cron expression
  retention?: number; // Days to keep backups
  compression?: boolean;
  encryption?: boolean;
  destination?: 's3' | 'local' | 'gcs';
}

// Performance metrics
export interface PerformanceMetrics {
  queries: {
    slow: Array<{
      query: string;
      duration: number;
      timestamp: Date;
    }>;
    total: number;
    avgDuration: number;
  };
  connections: {
    active: number;
    idle: number;
    max: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRatio: number;
  };
}

// Audit trail interface
export interface AuditTrail {
  action: string;
  resource: string;
  resourceId: string;
  userId: string;
  tenantId: string;
  timestamp: Date;
  changes?: {
    before: Record<string, any>;
    after: Record<string, any>;
  };
  metadata?: Record<string, any>;
}

// Database initialization function
export async function initializeDatabase(config?: DatabaseConfig): Promise<{
  client: PrismaClient;
  health: DatabaseHealth;
  stats?: DatabaseStats;
}> {
  try {
    // Test connection
    const health = await healthCheck();
    
    if (health.status === 'unhealthy') {
      throw new Error(`Database connection failed: ${health.details}`);
    }

    // Get initial stats
    const stats = await getDatabaseStats();

    // eslint-disable-next-line no-console
    console.log('✅ Database initialized successfully');
    
    return {
      client: prisma,
      health,
      stats: stats || undefined,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Graceful shutdown function
export async function shutdownDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    // eslint-disable-next-line no-console
    console.log('✅ Database connection closed gracefully');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Error during database shutdown:', error);
    throw error;
  }
}