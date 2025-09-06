/**
 * Main scraper service that orchestrates the zakup.sk.kz scraping operations
 */

import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';
import { createLogger, logError, logInfo, logSuccess, logWarning } from '../../utils/logger';

const logger = createLogger('SCRAPER');
import type { 
  ScrapingOptions, 
  ScrapingResult, 
  ScrapingProgress, 
  ScrapedTender, 
  ScrapingJob,
  ScrapingJobStatus
} from './scraper.types';
import { TransformerService } from './transformer.service';
import { PrismaClient } from '../../generated/prisma';
import { WebSocketService } from '../websocket';
import { MetricsService } from './metrics.service';

export class ScraperService extends EventEmitter {
  private prisma: PrismaClient;
  private transformer: TransformerService;
  private scraperPath: string;
  private activeJobs = new Map<string, ScrapingJob>();
  private websocketService?: WebSocketService;
  private metricsService: MetricsService;

  constructor(prisma: PrismaClient, websocketService?: WebSocketService) {
    super();
    this.prisma = prisma;
    this.transformer = new TransformerService(prisma);
    this.websocketService = websocketService;
    this.metricsService = new MetricsService(prisma);

    // Listen to performance alerts
    this.metricsService.on('performance_alert', (alert) => {
      logWarning('PERFORMANCE', alert.message, { severity: alert.severity, threshold: alert.threshold, current: alert.currentValue });
      if (this.websocketService) {
        this.websocketService.broadcastToTenant(alert.tenantId, {
          type: 'notification',
          data: {
            event: 'performance_alert',
            alert
          },
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Path to the Python scraper - try multiple possible locations
    const possiblePaths = [
      resolve(process.cwd(), '../../scraper'),
      resolve(process.cwd(), '../../../scraper'), 
      resolve(__dirname, '../../../../../scraper'),
      '/Users/zeidalqadri/Desktop/ConsurvBL/sustender/scraper'
    ];
    
    this.scraperPath = '';
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        this.scraperPath = path;
        break;
      }
    }
    
    if (!this.scraperPath) {
      throw new Error(`Scraper directory not found. Checked paths: ${possiblePaths.join(', ')}`);
    }
    
    logSuccess('INIT', `Scraper directory found at: ${this.scraperPath}`);
  }

  /**
   * Start a scraping job
   */
  async startScraping(
    tenantId: string,
    userId: string,
    options: ScrapingOptions = {}
  ): Promise<string> {
    const jobId = `scraping_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add tenantId to options for later use
    const jobOptions = { ...options, tenantId };
    
    // Create scraping log
    const scrapingLog = await this.prisma.scrapingLog.create({
      data: {
        tenantId,
        sourcePortal: options.sourcePortal || 'zakup.sk.kz',
        status: 'PENDING',
        triggeredBy: userId,
        metadata: {
          options: jobOptions,
          jobId
        }
      }
    });

    // Create job
    const job: ScrapingJob = {
      id: jobId,
      status: 'queued',
      options: jobOptions,
      startedAt: new Date()
    };

    this.activeJobs.set(jobId, job);

    // Start scraping asynchronously
    setImmediate(() => this.executeScraping(jobId, scrapingLog.id, tenantId, userId, options));

    return jobId;
  }

  /**
   * Execute the actual scraping process
   */
  private async executeScraping(
    jobId: string,
    logId: string,
    tenantId: string,
    userId: string,
    options: ScrapingOptions
  ): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    try {
      // Update job and log status
      job.status = 'running';
      await this.updateScrapingLog(logId, { status: 'RUNNING' });

      // Start metrics tracking
      this.metricsService.startJobMetrics(jobId, tenantId);

      const progressData = { status: 'running', message: 'Starting scraper...', jobId };
      this.emit('progress', jobId, progressData);
      
      // Send WebSocket notification
      if (this.websocketService) {
        this.websocketService.notifyScrapingProgress(jobId, tenantId, progressData);
      }

      // Prepare Python command
      const pythonScript = join(this.scraperPath, 'main.py');
      const args = [
        pythonScript,
        '--mode', 'scrape',
        '--headless', options.headless !== false ? 'true' : 'false',
        '--workers', (options.workers || 4).toString(),
      ];

      if (options.minValue !== undefined) {
        args.push('--min-value', options.minValue.toString());
      }

      if (options.maxDaysLeft !== undefined) {
        args.push('--days-left', options.maxDaysLeft.toString());
      }

      // Execute Python scraper with retry logic
      const result = await this.runPythonScraperWithRetry(args, jobId, tenantId, 3);

      if (result.success) {
        // Process scraped data
        const tendersFile = result.outputFile;
        if (tendersFile && existsSync(tendersFile)) {
          const processResult = await this.processTendersFile(tendersFile, tenantId, userId);
          
          // Update job with results
          job.status = 'completed';
          job.result = {
            ...result,
            tendersImported: processResult.imported,
            tendersUpdated: processResult.updated,
            tendersSkipped: processResult.skipped
          };
          job.completedAt = new Date();

          // Complete metrics tracking
          const finalMetrics = this.metricsService.completeJobMetrics(jobId, {
            tendersImported: processResult.imported,
            tendersUpdated: processResult.updated,
            tendersSkipped: processResult.skipped
          });

          // Update scraping log
          await this.updateScrapingLog(logId, {
            status: 'COMPLETED',
            completedAt: new Date(),
            pagesProcessed: result.pagesProcessed || 0,
            totalPages: result.totalPages,
            tendersFound: result.tendersFound || 0,
            tendersImported: processResult.imported,
            tendersUpdated: processResult.updated,
            tendersSkipped: processResult.skipped
          });

          this.emit('completed', jobId, job.result);
          
          // Send WebSocket notification for completion with metrics
          if (this.websocketService) {
            this.websocketService.notifyScrapingProgress(jobId, tenantId, {
              status: 'completed',
              result: job.result,
              metrics: finalMetrics,
              jobId
            });
          }
        } else {
          throw new Error('Scraping completed but no output file found');
        }
      } else {
        throw new Error(result.errorMessage || 'Scraping failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update job
      job.status = 'failed';
      job.errorMessage = errorMessage;
      job.completedAt = new Date();

      // Update scraping log
      await this.updateScrapingLog(logId, {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage,
        errorDetails: error
      });

      this.emit('failed', jobId, errorMessage);
      
      // Send WebSocket notification for failure
      if (this.websocketService) {
        this.websocketService.notifyScrapingProgress(jobId, tenantId, {
          status: 'failed',
          error: errorMessage,
          jobId
        });
      }
    }
  }

  /**
   * Run Python scraper with retry logic
   */
  private async runPythonScraperWithRetry(
    args: string[], 
    jobId: string, 
    tenantId: string, 
    maxRetries: number
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const progressData = { 
          status: 'running', 
          message: `Starting scraping attempt ${attempt}/${maxRetries}...`,
          jobId,
          attempt
        };
        this.emit('progress', jobId, progressData);
        
        if (this.websocketService) {
          this.websocketService.notifyScrapingProgress(jobId, tenantId, progressData);
        }

        const result = await this.runPythonScraper(args, jobId);
        
        // If successful, return immediately
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Track retry in metrics
        this.metricsService.incrementRetries(jobId);
        this.metricsService.incrementErrors(jobId);
        
        logError('SCRAPING', `Scraping attempt ${attempt} failed for job ${jobId}`, lastError);
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const waitTime = Math.min(30000, 5000 * Math.pow(2, attempt - 1)); // Max 30 seconds
          
          const retryProgressData = {
            status: 'running',
            message: `Attempt ${attempt} failed. Retrying in ${waitTime/1000} seconds...`,
            jobId,
            attempt,
            error: lastError.message
          };
          this.emit('progress', jobId, retryProgressData);
          
          if (this.websocketService) {
            this.websocketService.notifyScrapingProgress(jobId, tenantId, retryProgressData);
          }

          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries failed
    throw new Error(`Scraping failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Run the Python scraper
   */
  private async runPythonScraper(args: string[], jobId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', args, {
        cwd: this.scraperPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        
        // Parse progress updates
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('Scraping page') || line.includes('Total pages detected')) {
            const progressData = { 
              status: 'running', 
              message: line.trim(),
              jobId 
            };
            this.emit('progress', jobId, progressData);
            
            // Send WebSocket notification
            const job = this.activeJobs.get(jobId);
            if (this.websocketService && job) {
              // Extract tenant ID from active job metadata
              const tenantId = job.options.tenantId || 'default';
              this.websocketService.notifyScrapingProgress(jobId, tenantId, progressData);
            }
          }
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          // Parse output for results
          const results = this.parsePythonOutput(stdout);
          resolve({
            success: true,
            ...results
          });
        } else {
          reject(new Error(`Python scraper failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python scraper: ${error.message}`));
      });
    });
  }

  /**
   * Parse Python scraper output
   */
  private parsePythonOutput(output: string): any {
    const lines = output.split('\n');
    const result: any = {
      pagesProcessed: 0,
      tendersFound: 0
    };

    for (const line of lines) {
      // Look for results summary
      if (line.includes('Total tenders scraped:')) {
        const match = line.match(/(\d+)/);
        if (match) result.tendersFound = parseInt(match[1]);
      }
      
      if (line.includes('Total pages detected:')) {
        const match = line.match(/(\d+)/);
        if (match) result.totalPages = parseInt(match[1]);
      }

      if (line.includes('Results saved to:')) {
        const match = line.match(/Results saved to:\s+(.+\.csv)/);
        if (match) result.outputFile = join(this.scraperPath, match[1].trim());
      }
    }

    return result;
  }

  /**
   * Process scraped tenders CSV file
   */
  private async processTendersFile(
    filePath: string, 
    tenantId: string, 
    userId: string
  ): Promise<{ imported: number; updated: number; skipped: number }> {
    // This will be implemented by the transformer service
    return await this.transformer.processScrapedData(filePath, tenantId, userId);
  }

  /**
   * Update scraping log
   */
  private async updateScrapingLog(logId: string, updates: any): Promise<void> {
    await this.prisma.scrapingLog.update({
      where: { id: logId },
      data: updates
    });
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): ScrapingJob | undefined {
    return this.activeJobs.get(jobId);
  }

  /**
   * Cancel a scraping job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    if (job.status === 'running' || job.status === 'queued') {
      job.status = 'failed';
      job.errorMessage = 'Cancelled by user';
      job.completedAt = new Date();
      
      this.emit('cancelled', jobId);
      return true;
    }

    return false;
  }

  /**
   * Get scraping statistics
   */
  async getScrapingStats(tenantId: string): Promise<any> {
    const stats = await this.prisma.scrapingLog.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true
    });

    const recentLogs = await this.prisma.scrapingLog.findMany({
      where: { 
        tenantId,
        startedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      orderBy: { startedAt: 'desc' },
      take: 10
    });

    return {
      statusBreakdown: stats,
      recentActivity: recentLogs,
      totalJobs: stats.reduce((sum, stat) => sum + stat._count, 0)
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(tenantId: string, days: number = 7): Promise<any> {
    return await this.metricsService.getPerformanceStats(tenantId, days);
  }

  /**
   * Get system metrics
   */
  getSystemMetrics(): any {
    return this.metricsService.getSystemMetrics();
  }

  /**
   * Get active job metrics
   */
  getActiveJobMetrics(): any[] {
    return this.metricsService.getActiveJobMetrics();
  }

  /**
   * Clean up old jobs from memory
   */
  cleanup(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.completedAt && job.completedAt.getTime() < cutoff) {
        this.activeJobs.delete(jobId);
      }
    }
  }
}