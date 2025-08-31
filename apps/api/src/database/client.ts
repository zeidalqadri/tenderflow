import { PrismaClient, Prisma } from '../generated/prisma';

// Global for Prisma client to avoid re-instantiation during development
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Database connection configuration
const getDatabaseConfig = () => {
  const environment = process.env.NODE_ENV || 'development';
  
  const baseConfig: Prisma.PrismaClientOptions = {
    log: environment === 'development' 
      ? [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
        ]
      : [{ level: 'error', emit: 'stdout' }],
    errorFormat: 'pretty',
  };

  // Connection pooling configuration for production
  if (environment === 'production') {
    baseConfig.datasources = {
      db: {
        url: process.env.DATABASE_URL,
      },
    };
  }

  return baseConfig;
};

// Create Prisma client with proper configuration
const createPrismaClient = () => {
  const config = getDatabaseConfig();
  const client = new PrismaClient(config);

  // Log queries in development
  if (process.env.NODE_ENV === 'development') {
    client.$on('query', (e) => {
      console.log('Query: ' + e.query);
      console.log('Params: ' + e.params);
      console.log('Duration: ' + e.duration + 'ms');
      console.log('---');
    });
  }

  // Handle graceful shutdown
  process.on('beforeExit', async () => {
    await client.$disconnect();
  });

  return client;
};

// Singleton pattern for Prisma client
export const prisma = globalThis.__prisma || createPrismaClient();

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}

// Database health check
export async function healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
  try {
    // Simple query to test connection
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy' };
  } catch (error) {
    console.error('Database health check failed:', error);
    return {
      status: 'unhealthy',
      details: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

// Connection pool stats (useful for monitoring)
export async function getConnectionInfo() {
  try {
    const result = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'
    `;
    
    return {
      activeConnections: Number(result[0].count),
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Failed to get connection info:', error);
    return null;
  }
}

// Database statistics for monitoring
export async function getDatabaseStats() {
  try {
    const [tableStats, indexStats, connectionStats] = await Promise.all([
      // Table row counts
      prisma.$queryRaw<Array<{ table_name: string; row_count: number }>>`
        SELECT 
          schemaname,
          tablename as table_name,
          n_tup_ins + n_tup_upd + n_tup_del as row_count
        FROM pg_stat_user_tables
        ORDER BY row_count DESC
        LIMIT 10
      `,
      
      // Index usage
      prisma.$queryRaw<Array<{ table_name: string; index_name: string; index_scans: number }>>`
        SELECT 
          t.relname as table_name,
          i.relname as index_name,
          s.idx_scan as index_scans
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_stat_user_indexes s ON i.oid = s.indexrelid
        WHERE t.relkind = 'r'
        ORDER BY s.idx_scan DESC
        LIMIT 10
      `,
      
      // Connection statistics
      getConnectionInfo(),
    ]);

    return {
      tables: tableStats,
      indexes: indexStats,
      connections: connectionStats,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return null;
  }
}

// Transaction helper with retry logic
export async function withRetry<T>(
  operation: (prisma: PrismaClient) => Promise<T>,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation(prisma);
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on validation errors or business logic errors
      if (
        error instanceof Prisma.PrismaClientValidationError ||
        error instanceof Prisma.PrismaClientKnownRequestError
      ) {
        throw error;
      }

      console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  throw lastError;
}

// Transaction wrapper with proper typing
export async function transaction<T>(
  operations: (prisma: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  const defaultOptions = {
    maxWait: 5000, // 5 seconds
    timeout: 10000, // 10 seconds
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    ...options,
  };

  return await prisma.$transaction(operations, defaultOptions);
}

// Bulk operations helper
export class BulkOperations {
  static async bulkUpsert<T extends Record<string, any>>(
    model: string,
    data: T[],
    uniqueFields: (keyof T)[],
    batchSize: number = 100
  ) {
    const results = [];
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          const where = uniqueFields.reduce((acc, field) => {
            acc[field as string] = item[field];
            return acc;
          }, {} as Record<string, any>);

          return await (prisma as any)[model].upsert({
            where,
            update: item,
            create: item,
          });
        })
      );
      
      results.push(...batchResults);
    }
    
    return results;
  }

  static async bulkDelete<T>(
    model: string,
    whereConditions: T[],
    batchSize: number = 100
  ) {
    let totalDeleted = 0;
    
    for (let i = 0; i < whereConditions.length; i += batchSize) {
      const batch = whereConditions.slice(i, i + batchSize);
      
      for (const where of batch) {
        const result = await (prisma as any)[model].deleteMany({ where });
        totalDeleted += result.count;
      }
    }
    
    return { count: totalDeleted };
  }
}

// Query optimization helpers
export class QueryOptimizer {
  // Add select fields optimization
  static selectFields<T extends Record<string, boolean>>(fields: T): T {
    return fields;
  }

  // Pagination helper with cursor-based pagination
  static paginationArgs(
    page: number = 1,
    limit: number = 25,
    cursor?: string
  ) {
    const take = Math.min(limit, 100); // Max 100 items per page
    
    if (cursor) {
      return {
        take,
        skip: 1, // Skip the cursor
        cursor: { id: cursor },
      };
    }
    
    return {
      take,
      skip: (page - 1) * take,
    };
  }

  // Include relations helper
  static includeRelations<T extends Record<string, boolean | object>>(relations: T): T {
    return relations;
  }
}

// Database maintenance utilities
export class DatabaseMaintenance {
  // Analyze query performance
  static async analyzeSlowQueries(limit: number = 10) {
    try {
      const slowQueries = await prisma.$queryRaw<
        Array<{
          query: string;
          mean_exec_time: number;
          calls: number;
          total_exec_time: number;
        }>
      >`
        SELECT 
          query,
          mean_exec_time,
          calls,
          total_exec_time
        FROM pg_stat_statements 
        ORDER BY mean_exec_time DESC 
        LIMIT ${limit}
      `;
      
      return slowQueries;
    } catch (error) {
      console.warn('pg_stat_statements not available:', error);
      return [];
    }
  }

  // Clean up old audit logs
  static async cleanupAuditLogs(retentionDays: number = 2555) { // 7 years default
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  // Archive old tenders
  static async archiveOldTenders(archiveDays: number = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - archiveDays);

    const result = await prisma.tender.updateMany({
      where: {
        status: { in: ['WON', 'LOST'] },
        updatedAt: { lt: cutoffDate },
        NOT: { status: 'ARCHIVED' },
      },
      data: {
        status: 'ARCHIVED',
      },
    });

    return result.count;
  }

  // Vacuum and analyze tables
  static async vacuumAnalyze() {
    try {
      await prisma.$executeRaw`VACUUM ANALYZE`;
      return { success: true };
    } catch (error) {
      console.error('Vacuum analyze failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export commonly used types
export type {
  Prisma,
  PrismaClient,
  Tender,
  User,
  Bid,
  Document,
  Submission,
  TenderAssignment,
  TenderStatus,
  TenderCategory,
  UserRole,
  TenderRole,
  AuditAction,
  NotificationType,
} from '../generated/prisma';

// Export the client as default
export default prisma;