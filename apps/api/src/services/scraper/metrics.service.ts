/**
 * Scraper Performance Metrics and Monitoring Service
 */

import { PrismaClient } from '../../generated/prisma';
import { EventEmitter } from 'events';
import { createLogger, logError, logInfo, logSuccess, logWarning } from '../../utils/logger';

const logger = createLogger('SCRAPER_METRICS');

export interface ScrapingMetrics {
  jobId: string;
  tenantId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  pagesScraped: number;
  tendersFound: number;
  tendersImported: number;
  tendersUpdated: number;
  tendersSkipped: number;
  errors: number;
  retries: number;
  memoryUsage?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage?: {
    user: number;
    system: number;
  };
}

export interface PerformanceAlert {
  type: 'slow_scraping' | 'high_error_rate' | 'memory_leak' | 'low_success_rate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  jobId?: string;
  tenantId: string;
  metrics: any;
  timestamp: Date;
}

export class MetricsService extends EventEmitter {
  private prisma: PrismaClient;
  private activeMetrics = new Map<string, ScrapingMetrics>();
  private performanceThresholds = {
    maxScrapingTimePerPage: 30000, // 30 seconds per page
    maxTotalScrapingTime: 1800000, // 30 minutes total
    minSuccessRate: 0.8, // 80% success rate
    maxErrorRate: 0.2, // 20% error rate
    maxMemoryUsage: 500 * 1024 * 1024, // 500MB
  };

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.startPeriodicMonitoring();
  }

  /**
   * Start tracking metrics for a scraping job
   */
  startJobMetrics(jobId: string, tenantId: string): void {
    const metrics: ScrapingMetrics = {
      jobId,
      tenantId,
      startTime: new Date(),
      pagesScraped: 0,
      tendersFound: 0,
      tendersImported: 0,
      tendersUpdated: 0,
      tendersSkipped: 0,
      errors: 0,
      retries: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };

    this.activeMetrics.set(jobId, metrics);
    logInfo('METRICS', `Started metrics tracking for job ${jobId}`);
  }

  /**
   * Update job metrics
   */
  updateJobMetrics(jobId: string, updates: Partial<ScrapingMetrics>): void {
    const metrics = this.activeMetrics.get(jobId);
    if (!metrics) {
      logWarning('METRICS', `Metrics not found for job ${jobId}`);
      return;
    }

    Object.assign(metrics, updates);
    
    // Update memory and CPU usage
    metrics.memoryUsage = process.memoryUsage();
    metrics.cpuUsage = process.cpuUsage();

    // Check for performance issues
    this.checkPerformanceThresholds(metrics);
  }

  /**
   * Increment error count for a job
   */
  incrementErrors(jobId: string): void {
    const metrics = this.activeMetrics.get(jobId);
    if (metrics) {
      metrics.errors++;
      this.checkPerformanceThresholds(metrics);
    }
  }

  /**
   * Increment retry count for a job
   */
  incrementRetries(jobId: string): void {
    const metrics = this.activeMetrics.get(jobId);
    if (metrics) {
      metrics.retries++;
    }
  }

  /**
   * Complete job metrics tracking
   */
  completeJobMetrics(
    jobId: string, 
    result: {
      tendersImported: number;
      tendersUpdated: number;
      tendersSkipped: number;
    }
  ): ScrapingMetrics | null {
    const metrics = this.activeMetrics.get(jobId);
    if (!metrics) {
      return null;
    }

    metrics.endTime = new Date();
    metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
    metrics.tendersImported = result.tendersImported;
    metrics.tendersUpdated = result.tendersUpdated;
    metrics.tendersSkipped = result.tendersSkipped;

    // Final performance check
    this.checkPerformanceThresholds(metrics);

    // Store metrics in database
    this.storeMetrics(metrics);

    // Remove from active tracking
    this.activeMetrics.delete(jobId);

    logSuccess('METRICS', `Completed metrics for job ${jobId}: ${metrics.duration}ms, ${metrics.tendersImported} imported`);
    
    return metrics;
  }

  /**
   * Get real-time metrics for active jobs
   */
  getActiveJobMetrics(): ScrapingMetrics[] {
    return Array.from(this.activeMetrics.values());
  }

  /**
   * Get historical performance statistics
   */
  async getPerformanceStats(tenantId: string, days: number = 7): Promise<{
    totalJobs: number;
    averageDuration: number;
    averageSuccessRate: number;
    averageTendersPerJob: number;
    errorRate: number;
    performanceAlerts: number;
    trends: {
      jobsPerDay: Array<{ date: string; count: number }>;
      averageDurationTrend: Array<{ date: string; duration: number }>;
      errorRateTrend: Array<{ date: string; errorRate: number }>;
    };
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get scraping logs for performance analysis
    const scrapingLogs = await this.prisma.scrapingLog.findMany({
      where: {
        tenantId,
        startedAt: { gte: startDate }
      },
      orderBy: { startedAt: 'asc' }
    });

    const totalJobs = scrapingLogs.length;
    const completedJobs = scrapingLogs.filter(log => log.status === 'COMPLETED');
    const failedJobs = scrapingLogs.filter(log => log.status === 'FAILED');

    // Calculate averages
    const totalDuration = completedJobs.reduce((sum, log) => {
      if (log.completedAt) {
        return sum + (log.completedAt.getTime() - log.startedAt.getTime());
      }
      return sum;
    }, 0);

    const averageDuration = completedJobs.length > 0 ? totalDuration / completedJobs.length : 0;
    const averageSuccessRate = totalJobs > 0 ? completedJobs.length / totalJobs : 0;
    const errorRate = totalJobs > 0 ? failedJobs.length / totalJobs : 0;
    
    const totalTenders = completedJobs.reduce((sum, log) => sum + log.tendersImported, 0);
    const averageTendersPerJob = completedJobs.length > 0 ? totalTenders / completedJobs.length : 0;

    // Generate trends (daily aggregates)
    const trends = this.generatePerformanceTrends(scrapingLogs, days);

    // Count performance alerts from metadata
    const performanceAlerts = scrapingLogs.reduce((count, log) => {
      const metadata = log.metadata as any;
      return count + (metadata?.performanceAlerts?.length || 0);
    }, 0);

    return {
      totalJobs,
      averageDuration,
      averageSuccessRate,
      averageTendersPerJob,
      errorRate,
      performanceAlerts,
      trends
    };
  }

  /**
   * Check performance thresholds and emit alerts
   */
  private checkPerformanceThresholds(metrics: ScrapingMetrics): void {
    const alerts: PerformanceAlert[] = [];
    const currentTime = new Date();
    const runningTime = currentTime.getTime() - metrics.startTime.getTime();

    // Check scraping speed
    if (metrics.pagesScraped > 0) {
      const timePerPage = runningTime / metrics.pagesScraped;
      if (timePerPage > this.performanceThresholds.maxScrapingTimePerPage) {
        alerts.push({
          type: 'slow_scraping',
          severity: 'medium',
          message: `Scraping is slow: ${Math.round(timePerPage / 1000)}s per page`,
          jobId: metrics.jobId,
          tenantId: metrics.tenantId,
          metrics: { timePerPage, pagesScraped: metrics.pagesScraped },
          timestamp: currentTime
        });
      }
    }

    // Check total runtime
    if (runningTime > this.performanceThresholds.maxTotalScrapingTime) {
      alerts.push({
        type: 'slow_scraping',
        severity: 'high',
        message: `Scraping taking too long: ${Math.round(runningTime / 1000 / 60)} minutes`,
        jobId: metrics.jobId,
        tenantId: metrics.tenantId,
        metrics: { runningTime, maxTime: this.performanceThresholds.maxTotalScrapingTime },
        timestamp: currentTime
      });
    }

    // Check error rate
    const totalOperations = metrics.pagesScraped || 1;
    const errorRate = metrics.errors / totalOperations;
    if (errorRate > this.performanceThresholds.maxErrorRate) {
      alerts.push({
        type: 'high_error_rate',
        severity: errorRate > 0.5 ? 'critical' : 'high',
        message: `High error rate: ${Math.round(errorRate * 100)}%`,
        jobId: metrics.jobId,
        tenantId: metrics.tenantId,
        metrics: { errorRate, errors: metrics.errors, totalOperations },
        timestamp: currentTime
      });
    }

    // Check memory usage
    if (metrics.memoryUsage && metrics.memoryUsage.rss > this.performanceThresholds.maxMemoryUsage) {
      alerts.push({
        type: 'memory_leak',
        severity: 'high',
        message: `High memory usage: ${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB`,
        jobId: metrics.jobId,
        tenantId: metrics.tenantId,
        metrics: { memoryUsage: metrics.memoryUsage },
        timestamp: currentTime
      });
    }

    // Emit alerts
    for (const alert of alerts) {
      this.emit('performance_alert', alert);
      logWarning('PERFORMANCE_ALERT', alert.message, { severity: alert.severity, threshold: alert.threshold, currentValue: alert.currentValue });
    }
  }

  /**
   * Store metrics in database
   */
  private async storeMetrics(metrics: ScrapingMetrics): Promise<void> {
    try {
      // Update the scraping log with performance metrics
      await this.prisma.scrapingLog.updateMany({
        where: {
          tenantId: metrics.tenantId,
          metadata: {
            path: ['jobId'],
            equals: metrics.jobId
          }
        },
        data: {
          metadata: {
            jobId: metrics.jobId,
            performanceMetrics: {
              duration: metrics.duration,
              pagesScraped: metrics.pagesScraped,
              tendersFound: metrics.tendersFound,
              errors: metrics.errors,
              retries: metrics.retries,
              memoryUsage: metrics.memoryUsage,
              cpuUsage: metrics.cpuUsage
            }
          }
        }
      });
    } catch (error) {
      logError('METRICS', 'Failed to store metrics', error as Error);
    }
  }

  /**
   * Generate performance trends
   */
  private generatePerformanceTrends(logs: any[], days: number): {
    jobsPerDay: Array<{ date: string; count: number }>;
    averageDurationTrend: Array<{ date: string; duration: number }>;
    errorRateTrend: Array<{ date: string; errorRate: number }>;
  } {
    const trends = {
      jobsPerDay: [] as Array<{ date: string; count: number }>,
      averageDurationTrend: [] as Array<{ date: string; duration: number }>,
      errorRateTrend: [] as Array<{ date: string; errorRate: number }>
    };

    // Group logs by date
    const logsByDate = new Map<string, any[]>();
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      logsByDate.set(dateStr, []);
    }

    for (const log of logs) {
      const dateStr = log.startedAt.toISOString().split('T')[0];
      if (logsByDate.has(dateStr)) {
        logsByDate.get(dateStr)!.push(log);
      }
    }

    // Calculate trends
    for (const [dateStr, dayLogs] of logsByDate) {
      trends.jobsPerDay.push({ date: dateStr, count: dayLogs.length });

      const completedLogs = dayLogs.filter(log => log.status === 'COMPLETED' && log.completedAt);
      const failedLogs = dayLogs.filter(log => log.status === 'FAILED');

      if (completedLogs.length > 0) {
        const avgDuration = completedLogs.reduce((sum, log) => {
          return sum + (log.completedAt.getTime() - log.startedAt.getTime());
        }, 0) / completedLogs.length;

        trends.averageDurationTrend.push({ date: dateStr, duration: avgDuration });
      }

      const errorRate = dayLogs.length > 0 ? failedLogs.length / dayLogs.length : 0;
      trends.errorRateTrend.push({ date: dateStr, errorRate });
    }

    return trends;
  }

  /**
   * Start periodic monitoring
   */
  private startPeriodicMonitoring(): void {
    setInterval(() => {
      this.performHealthCheck();
    }, 60000); // Every minute

    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000); // Every hour
  }

  /**
   * Perform health check on active jobs
   */
  private performHealthCheck(): void {
    for (const [jobId, metrics] of this.activeMetrics) {
      const runningTime = Date.now() - metrics.startTime.getTime();
      
      // Check for jobs that might be stuck
      if (runningTime > 2 * this.performanceThresholds.maxTotalScrapingTime) {
        this.emit('performance_alert', {
          type: 'slow_scraping',
          severity: 'critical',
          message: `Job ${jobId} appears to be stuck (running for ${Math.round(runningTime / 1000 / 60)} minutes)`,
          jobId,
          tenantId: metrics.tenantId,
          metrics: { runningTime },
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * Cleanup old metrics from memory
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    
    for (const [jobId, metrics] of this.activeMetrics) {
      if (metrics.startTime.getTime() < cutoffTime) {
        logInfo('CLEANUP', `Cleaning up stale metrics for job ${jobId}`);
        this.activeMetrics.delete(jobId);
      }
    }
  }

  /**
   * Get system resource usage
   */
  getSystemMetrics(): {
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
    uptime: number;
    activeJobs: number;
  } {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      activeJobs: this.activeMetrics.size
    };
  }
}