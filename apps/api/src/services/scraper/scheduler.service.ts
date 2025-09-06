/**
 * Scheduler service for automated scraping operations
 */

import { PrismaClient } from '../../generated/prisma';
import { ScraperService } from './scraper.service';
import { EventEmitter } from 'events';
import { createLogger, logError, logInfo, logSuccess } from '../../utils/logger';

const logger = createLogger('SCRAPER_SCHEDULER');

interface ScheduledJob {
  id: string;
  tenantId: string;
  interval: number; // in milliseconds
  options: any;
  nextRun: Date;
  isActive: boolean;
  lastRun?: Date;
  lastResult?: any;
}

export class SchedulerService extends EventEmitter {
  private prisma: PrismaClient;
  private scraperService: ScraperService;
  private scheduledJobs = new Map<string, ScheduledJob>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private isRunning = false;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.scraperService = new ScraperService(prisma);
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    logInfo('SCHEDULER', 'Starting scraper scheduler...');
    this.isRunning = true;

    // Load existing schedules from database
    await this.loadSchedules();

    // Check for jobs every minute
    this.scheduleNextCheck();

    this.emit('started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    logInfo('SCHEDULER', 'Stopping scraper scheduler...');
    
    // Clear all intervals
    for (const interval of this.intervals.values()) {
      clearTimeout(interval);
    }
    this.intervals.clear();

    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Schedule a recurring scraping job
   */
  async scheduleJob(
    tenantId: string,
    userId: string,
    intervalHours: number,
    options: any = {}
  ): Promise<string> {
    const jobId = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    // Create job record
    const job: ScheduledJob = {
      id: jobId,
      tenantId,
      interval: intervalMs,
      options: {
        ...options,
        userId, // Store userId for execution
      },
      nextRun: new Date(Date.now() + intervalMs),
      isActive: true
    };

    this.scheduledJobs.set(jobId, job);

    // Save to database
    await this.saveSchedule(job);

    // Schedule the job
    this.scheduleJob_internal(job);

    logSuccess('SCHEDULE', `Scheduled scraping job ${jobId} for tenant ${tenantId} every ${intervalHours}h`);
    this.emit('scheduled', jobId, job);

    return jobId;
  }

  /**
   * Cancel a scheduled job
   */
  async cancelScheduledJob(jobId: string): Promise<boolean> {
    const job = this.scheduledJobs.get(jobId);
    if (!job) return false;

    // Clear interval
    const interval = this.intervals.get(jobId);
    if (interval) {
      clearTimeout(interval);
      this.intervals.delete(jobId);
    }

    // Mark as inactive
    job.isActive = false;
    await this.saveSchedule(job);

    this.scheduledJobs.delete(jobId);
    
    logInfo('SCHEDULE', `Cancelled scheduled job ${jobId}`);
    this.emit('cancelled', jobId);

    return true;
  }

  /**
   * Get all scheduled jobs for a tenant
   */
  getScheduledJobs(tenantId: string): ScheduledJob[] {
    return Array.from(this.scheduledJobs.values())
      .filter(job => job.tenantId === tenantId && job.isActive);
  }

  /**
   * Update job schedule
   */
  async updateSchedule(jobId: string, intervalHours: number, options?: any): Promise<boolean> {
    const job = this.scheduledJobs.get(jobId);
    if (!job) return false;

    const newIntervalMs = intervalHours * 60 * 60 * 1000;

    // Clear existing interval
    const interval = this.intervals.get(jobId);
    if (interval) {
      clearTimeout(interval);
    }

    // Update job
    job.interval = newIntervalMs;
    job.nextRun = new Date(Date.now() + newIntervalMs);
    
    if (options) {
      job.options = { ...job.options, ...options };
    }

    // Save to database
    await this.saveSchedule(job);

    // Reschedule
    this.scheduleJob_internal(job);

    logSuccess('SCHEDULE', `Updated schedule for job ${jobId}`);
    this.emit('updated', jobId, job);

    return true;
  }

  /**
   * Execute a scheduled job immediately
   */
  async executeJobNow(jobId: string): Promise<string | null> {
    const job = this.scheduledJobs.get(jobId);
    if (!job || !job.isActive) return null;

    return await this.executeJob(job);
  }

  /**
   * Get scheduler statistics
   */
  getStats(): any {
    const activeJobs = Array.from(this.scheduledJobs.values()).filter(j => j.isActive);
    
    return {
      isRunning: this.isRunning,
      totalJobs: this.scheduledJobs.size,
      activeJobs: activeJobs.length,
      upcomingJobs: activeJobs
        .filter(j => j.nextRun > new Date())
        .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
        .slice(0, 5)
        .map(j => ({
          id: j.id,
          tenantId: j.tenantId,
          nextRun: j.nextRun,
          interval: j.interval / (1000 * 60 * 60) // hours
        }))
    };
  }

  // Private methods

  private async loadSchedules(): Promise<void> {
    try {
      // Load from system config or dedicated scheduler table
      const schedules = await this.prisma.systemConfig.findMany({
        where: {
          key: {
            startsWith: 'scraper_schedule_'
          }
        }
      });

      for (const config of schedules) {
        try {
          const job = config.value as ScheduledJob;
          if (job.isActive) {
            this.scheduledJobs.set(job.id, job);
            this.scheduleJob_internal(job);
          }
        } catch (error) {
          logError('SCHEDULE', `Failed to load schedule ${config.key}`, error as Error);
        }
      }

      logSuccess('SCHEDULE', `Loaded ${this.scheduledJobs.size} scheduled jobs`);

    } catch (error) {
      logError('SCHEDULE', 'Failed to load schedules', error as Error);
    }
  }

  private async saveSchedule(job: ScheduledJob): Promise<void> {
    try {
      await this.prisma.systemConfig.upsert({
        where: {
          key: `scraper_schedule_${job.id}`
        },
        create: {
          key: `scraper_schedule_${job.id}`,
          value: job as any,
          description: `Scheduled scraping job for tenant ${job.tenantId}`
        },
        update: {
          value: job as any,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      logError('SCHEDULE', `Failed to save schedule ${job.id}`, error as Error);
    }
  }

  private scheduleJob_internal(job: ScheduledJob): void {
    if (!job.isActive) return;

    const now = new Date().getTime();
    const delay = Math.max(0, job.nextRun.getTime() - now);

    const timeoutId = setTimeout(async () => {
      await this.executeJob(job);
      
      // Schedule next run
      if (job.isActive) {
        job.nextRun = new Date(Date.now() + job.interval);
        await this.saveSchedule(job);
        this.scheduleJob_internal(job);
      }
    }, delay);

    this.intervals.set(job.id, timeoutId);

    logInfo('EXECUTION', `Scheduled job ${job.id} to run in ${Math.round(delay / 1000)}s`);
  }

  private async executeJob(job: ScheduledJob): Promise<string> {
    logInfo('EXECUTION', `Executing scheduled scraping job ${job.id} for tenant ${job.tenantId}`);
    
    try {
      const scrapingJobId = await this.scraperService.startScraping(
        job.tenantId,
        job.options.userId,
        job.options
      );

      job.lastRun = new Date();
      job.lastResult = { success: true, scrapingJobId };
      
      await this.saveSchedule(job);

      this.emit('executed', job.id, scrapingJobId);
      
      return scrapingJobId;

    } catch (error) {
      logError('EXECUTION', `Failed to execute scheduled job ${job.id}`, error as Error);
      
      job.lastRun = new Date();
      job.lastResult = { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
      
      await this.saveSchedule(job);

      this.emit('failed', job.id, error);
      
      throw error;
    }
  }

  private scheduleNextCheck(): void {
    if (!this.isRunning) return;

    setTimeout(() => {
      this.checkJobs();
      this.scheduleNextCheck();
    }, 60000); // Check every minute
  }

  private checkJobs(): void {
    // This runs periodically to catch any missed jobs
    // and ensure all jobs are properly scheduled
    const now = new Date();
    
    for (const [jobId, job] of this.scheduledJobs.entries()) {
      if (job.isActive && job.nextRun <= now && !this.intervals.has(jobId)) {
        logInfo('RECOVERY', `Rescheduling missed job ${jobId}`);
        this.scheduleJob_internal(job);
      }
    }
  }

  /**
   * Create default scraping schedule (every 6 hours)
   */
  async createDefaultSchedule(tenantId: string, userId: string): Promise<string> {
    return await this.scheduleJob(tenantId, userId, 6, {
      headless: true,
      workers: 4,
      sourcePortal: 'zakup.sk.kz'
    });
  }

  /**
   * Cleanup old schedules and logs
   */
  async cleanup(): Promise<void> {
    try {
      // Remove inactive schedules older than 30 days
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      await this.prisma.systemConfig.deleteMany({
        where: {
          key: {
            startsWith: 'scraper_schedule_'
          },
          updatedAt: {
            lt: cutoff
          },
          value: {
            path: ['isActive'],
            equals: false
          }
        }
      });

      logSuccess('CLEANUP', 'Cleaned up old schedules');

    } catch (error) {
      logError('CLEANUP', 'Failed to cleanup schedules', error as Error);
    }
  }
}