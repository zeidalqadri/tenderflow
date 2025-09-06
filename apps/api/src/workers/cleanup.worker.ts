import { Worker, Job } from 'bullmq';
import { bullmqRedis } from '../services/redis';
import { prisma } from '../database/client';
import { createLogger, logInfo, logError, logSuccess, logWarning } from '../utils/logger';
import { QUEUE_NAMES, JobMonitor } from '../services/queue';
import { CacheManager } from '../services/redis';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('CLEANUP_WORKER');

interface CleanupJobData {
  type: 'audit_logs' | 'old_tenders' | 'temp_files' | 'failed_jobs' | 'daily_maintenance' | 'retry_failed';
  retentionDays?: number;
  [key: string]: any;
}

export const cleanupWorker = new Worker<CleanupJobData>(
  QUEUE_NAMES.CLEANUP,
  async (job: Job<CleanupJobData>) => {
    const { type, retentionDays, ...options } = job.data;
    
    logInfo('WORKER', `Starting cleanup job ${job.id} - Type: ${type}`);
    
    try {
      let result: any = {};
      
      switch (type) {
        case 'audit_logs':
          result = await cleanupAuditLogs(retentionDays || 2555);
          break;
          
        case 'old_tenders':
          result = await cleanupOldTenders(retentionDays || 365);
          break;
          
        case 'temp_files':
          result = await cleanupTempFiles();
          break;
          
        case 'failed_jobs':
          result = await cleanupFailedJobs();
          break;
          
        case 'daily_maintenance':
          result = await performDailyMaintenance();
          break;
          
        case 'retry_failed':
          result = await retryFailedJobs();
          break;
          
        default:
          throw new Error(`Unknown cleanup type: ${type}`);
      }
      
      await job.updateProgress(100);
      
      logSuccess('WORKER', `Cleanup job ${job.id} completed - Type: ${type}`);
      
      return {
        success: true,
        type,
        result,
        timestamp: new Date(),
      };
      
    } catch (error) {
      logError('WORKER', `Cleanup job ${job.id} failed`, error as Error);
      throw error;
    }
  },
  {
    connection: bullmqRedis,
    concurrency: 1,
  }
);

async function cleanupAuditLogs(retentionDays: number): Promise<any> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  logInfo('CLEANUP', `Cleaning audit logs older than ${cutoffDate.toISOString()}`);
  
  const archivedCount = await archiveOldAuditLogs(cutoffDate);
  
  const deleted = await prisma.auditLog.deleteMany({
    where: {
      timestamp: {
        lt: cutoffDate,
      },
      archived: true,
    },
  });
  
  logSuccess('CLEANUP', `Deleted ${deleted.count} old audit logs, archived ${archivedCount}`);
  
  return {
    archived: archivedCount,
    deleted: deleted.count,
    cutoffDate,
  };
}

async function archiveOldAuditLogs(cutoffDate: Date): Promise<number> {
  const logsToArchive = await prisma.auditLog.findMany({
    where: {
      timestamp: {
        lt: cutoffDate,
      },
      archived: false,
    },
    take: 1000,
  });
  
  if (logsToArchive.length === 0) return 0;
  
  const archiveDir = path.join(process.env.ARCHIVE_DIR || './archives', 'audit_logs');
  await fs.mkdir(archiveDir, { recursive: true });
  
  const archiveFile = path.join(archiveDir, `audit_logs_${Date.now()}.json`);
  await fs.writeFile(archiveFile, JSON.stringify(logsToArchive, null, 2));
  
  const logIds = logsToArchive.map(log => log.id);
  await prisma.auditLog.updateMany({
    where: { id: { in: logIds } },
    data: { 
      archived: true,
      archivedAt: new Date()
    },
  });
  
  logInfo('ARCHIVE', `Archived ${logsToArchive.length} audit logs to ${archiveFile}`);
  
  return logsToArchive.length;
}

async function cleanupOldTenders(retentionDays: number): Promise<any> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  logInfo('CLEANUP', `Cleaning tenders older than ${cutoffDate.toISOString()}`);
  
  const oldTenders = await prisma.tender.findMany({
    where: {
      createdAt: { lt: cutoffDate },
      status: { in: ['ARCHIVED', 'EXPIRED', 'CANCELLED'] },
    },
    select: {
      id: true,
      title: true,
      documents: { select: { id: true, fileName: true, filePath: true } },
    },
  });
  
  let documentsDeleted = 0;
  for (const tender of oldTenders) {
    for (const doc of tender.documents) {
      if (doc.filePath) {
        try {
          await fs.unlink(doc.filePath);
          documentsDeleted++;
        } catch (error) {
          logWarning('CLEANUP', `Failed to delete document file: ${doc.filePath}`);
        }
      }
    }
    
    await prisma.document.deleteMany({
      where: { tenderId: tender.id },
    });
  }
  
  const deleted = await prisma.tender.deleteMany({
    where: {
      id: { in: oldTenders.map(t => t.id) },
    },
  });
  
  await CacheManager.invalidatePattern('tender:*');
  
  logSuccess('CLEANUP', `Deleted ${deleted.count} old tenders and ${documentsDeleted} documents`);
  
  return {
    tendersDeleted: deleted.count,
    documentsDeleted,
    cutoffDate,
  };
}

async function cleanupTempFiles(): Promise<any> {
  const tempDir = process.env.TEMP_DIR || path.join(process.cwd(), 'temp');
  
  try {
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    
    let deletedCount = 0;
    let totalSize = 0;
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        totalSize += stats.size;
        await fs.unlink(filePath);
        deletedCount++;
      }
    }
    
    logSuccess('CLEANUP', `Deleted ${deletedCount} temp files (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
    
    return {
      filesDeleted: deletedCount,
      spaceCleaned: totalSize,
    };
  } catch (error) {
    logError('CLEANUP', 'Error cleaning temp files', error as Error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function cleanupFailedJobs(): Promise<any> {
  const results: any = {};
  
  for (const queueName of Object.keys(QUEUE_NAMES) as Array<keyof typeof QUEUE_NAMES>) {
    try {
      await JobMonitor.cleanQueue(queueName, 7 * 24 * 60 * 60 * 1000);
      
      const stats = await JobMonitor.getQueueStats(queueName);
      results[queueName] = stats;
      
    } catch (error) {
      logError('CLEANUP', `Error cleaning queue ${queueName}`, error as Error);
      results[queueName] = { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  logSuccess('CLEANUP', 'Failed jobs cleanup completed');
  
  return results;
}

async function retryFailedJobs(): Promise<any> {
  const results: any = {};
  
  for (const queueName of Object.keys(QUEUE_NAMES) as Array<keyof typeof QUEUE_NAMES>) {
    try {
      const retriedCount = await JobMonitor.retryFailedJobs(queueName, 5);
      results[queueName] = { retried: retriedCount };
      
      if (retriedCount > 0) {
        logInfo('RETRY', `Retried ${retriedCount} failed jobs in ${queueName}`);
      }
    } catch (error) {
      logError('RETRY', `Error retrying jobs in ${queueName}`, error as Error);
      results[queueName] = { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  return results;
}

async function performDailyMaintenance(): Promise<any> {
  logInfo('MAINTENANCE', 'Starting daily maintenance tasks');
  
  const tasks = [];
  
  tasks.push(cleanupExpiredSessions());
  tasks.push(updateTenderStatistics());
  tasks.push(cleanupOrphanedDocuments());
  tasks.push(optimizeDatabase());
  tasks.push(clearOldCaches());
  
  const results = await Promise.allSettled(tasks);
  
  const summary = {
    successful: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    details: results.map((r, i) => ({
      task: ['sessions', 'statistics', 'documents', 'database', 'cache'][i],
      status: r.status,
      result: r.status === 'fulfilled' ? r.value : (r as PromiseRejectedResult).reason,
    })),
  };
  
  logSuccess('MAINTENANCE', `Daily maintenance completed: ${summary.successful} successful, ${summary.failed} failed`);
  
  return summary;
}

async function cleanupExpiredSessions(): Promise<any> {
  const expired = await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  
  logInfo('SESSIONS', `Cleaned up ${expired.count} expired sessions`);
  
  return { sessionsDeleted: expired.count };
}

async function updateTenderStatistics(): Promise<any> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
  });
  
  for (const tenant of tenants) {
    const stats = await prisma.tender.aggregate({
      where: { tenantId: tenant.id },
      _count: { _all: true },
      _sum: { estimatedValue: true },
      _avg: { estimatedValue: true },
    });
    
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        metadata: {
          ...tenant.metadata,
          statistics: {
            totalTenders: stats._count._all,
            totalValue: stats._sum.estimatedValue || 0,
            averageValue: stats._avg.estimatedValue || 0,
            lastUpdated: new Date(),
          },
        },
      },
    });
  }
  
  logInfo('STATS', `Updated statistics for ${tenants.length} tenants`);
  
  return { tenantsUpdated: tenants.length };
}

async function cleanupOrphanedDocuments(): Promise<any> {
  const orphaned = await prisma.document.findMany({
    where: {
      tenderId: null,
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });
  
  let filesDeleted = 0;
  for (const doc of orphaned) {
    if (doc.filePath) {
      try {
        await fs.unlink(doc.filePath);
        filesDeleted++;
      } catch (error) {
        logWarning('CLEANUP', `Failed to delete orphaned file: ${doc.filePath}`);
      }
    }
  }
  
  const deleted = await prisma.document.deleteMany({
    where: {
      id: { in: orphaned.map(d => d.id) },
    },
  });
  
  logInfo('DOCUMENTS', `Cleaned up ${deleted.count} orphaned documents`);
  
  return {
    documentsDeleted: deleted.count,
    filesDeleted,
  };
}

async function optimizeDatabase(): Promise<any> {
  try {
    await prisma.$executeRaw`VACUUM ANALYZE`;
    
    const tablesOptimized = [
      'tenders',
      'documents',
      'audit_logs',
      'notifications',
      'sessions',
    ];
    
    for (const table of tablesOptimized) {
      await prisma.$executeRawUnsafe(`REINDEX TABLE ${table}`);
    }
    
    logInfo('DATABASE', 'Database optimization completed');
    
    return {
      vacuumed: true,
      tablesOptimized,
    };
  } catch (error) {
    logError('DATABASE', 'Database optimization failed', error as Error);
    throw error;
  }
}

async function clearOldCaches(): Promise<any> {
  const patterns = [
    'tender:*:temp:*',
    'search:*:expired:*',
    'session:*:old:*',
  ];
  
  let totalCleared = 0;
  
  for (const pattern of patterns) {
    const cleared = await CacheManager.invalidatePattern(pattern);
    totalCleared += cleared;
  }
  
  logInfo('CACHE', `Cleared ${totalCleared} old cache entries`);
  
  return { entriesCleared: totalCleared };
}

cleanupWorker.on('completed', (job) => {
  logSuccess('WORKER', `Job ${job.id} completed successfully`);
});

cleanupWorker.on('failed', (job, err) => {
  logError('WORKER', `Job ${job?.id} failed`, err);
});

export default cleanupWorker;