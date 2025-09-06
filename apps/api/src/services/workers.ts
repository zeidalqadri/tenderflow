import { Worker, Job } from 'bullmq';
import { bullmqRedis } from './redis';
import { prisma } from '../database/client';
import { createLogger, logError, logInfo, logSuccess } from '../utils/logger';

const logger = createLogger('WORKERS');
import {
  QUEUE_NAMES,
  ScrapingJobData,
  TenderProcessingJobData,
  NotificationJobData,
  DocumentProcessingJobData,
} from './queue';

// Import services
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// Scraping Worker
export class ScrapingWorker {
  private worker: Worker<ScrapingJobData>;

  constructor() {
    this.worker = new Worker<ScrapingJobData>(
      QUEUE_NAMES.SCRAPING,
      async (job: Job<ScrapingJobData>) => {
        return await this.processScraping(job);
      },
      {
        connection: bullmqRedis,
        concurrency: 2, // Limit concurrent scraping jobs
        limiter: {
          max: 1, // Only 1 scraping job per minute
          duration: 60 * 1000,
        },
      }
    );

    this.setupEventHandlers();
  }

  private async processScraping(job: Job<ScrapingJobData>): Promise<any> {
    const {
      tenantId,
      sourcePortal,
      triggeredBy,
      options = {},
      scrapingLogId,
    } = job.data as ScrapingJobData & { scrapingLogId: string };

    logInfo('SCRAPING', `Starting scraping job ${job.id} for tenant ${tenantId}`);

    try {
      // Update scraping log to RUNNING
      await prisma.scrapingLog.update({
        where: { id: scrapingLogId },
        data: {
          status: 'RUNNING',
          metadata: {
            ...job.data.metadata,
            jobId: job.id,
          },
        },
      });

      // Progress tracking
      await job.updateProgress(0);

      // Execute the Python scraper
      const scraperPath = path.join(process.cwd(), '../../scraper');
      const outputDir = path.join(scraperPath, 'output');
      
      const command = [
        'python3',
        path.join(scraperPath, 'improved_scraper.py'),
        '--portal', sourcePortal,
        '--output-dir', outputDir,
        '--format', 'json',
      ];

      // Add optional parameters
      if (options.maxPages) {
        command.push('--max-pages', options.maxPages.toString());
      }
      if (options.startDate) {
        command.push('--start-date', options.startDate);
      }
      if (options.endDate) {
        command.push('--end-date', options.endDate);
      }
      if (options.forceRefresh) {
        command.push('--force-refresh');
      }

      logInfo('SCRAPING', 'Executing scraper command', { command: command.join(' ') });

      await job.updateProgress(25);

      const { stdout, stderr } = await execAsync(command.join(' '), {
        timeout: 30 * 60 * 1000, // 30 minute timeout
        cwd: scraperPath,
      });

      await job.updateProgress(75);

      // Parse the output to extract statistics
      const outputLines = stdout.split('\n');
      const errorLines = stderr.split('\n');
      
      let tendersFound = 0;
      let pagesProcessed = 0;
      let outputFile: string | null = null;

      // Look for scraper output patterns
      for (const line of outputLines) {
        if (line.includes('Found') && line.includes('tenders')) {
          const match = line.match(/Found (\d+) tenders/);
          if (match) tendersFound = parseInt(match[1]);
        }
        if (line.includes('Processed') && line.includes('pages')) {
          const match = line.match(/Processed (\d+) pages/);
          if (match) pagesProcessed = parseInt(match[1]);
        }
        if (line.includes('Output saved to:')) {
          outputFile = line.split('Output saved to:')[1]?.trim();
        }
      }

      await job.updateProgress(90);

      // Import the scraped data
      let importResults = { imported: 0, updated: 0, skipped: 0 };
      
      if (outputFile && outputFile.endsWith('.json')) {
        try {
          importResults = await this.importScrapedData(
            outputFile,
            tenantId,
            triggeredBy,
            sourcePortal
          );
        } catch (importError) {
          logError('SCRAPING', 'Error importing scraped data', importError as Error);
          // Don't fail the job, but log the error
        }
      }

      await job.updateProgress(100);

      // Update scraping log with results
      const completedAt = new Date();
      await prisma.scrapingLog.update({
        where: { id: scrapingLogId },
        data: {
          status: 'COMPLETED',
          completedAt,
          pagesProcessed,
          tendersFound,
          tendersImported: importResults.imported,
          tendersUpdated: importResults.updated,
          tendersSkipped: importResults.skipped,
          metadata: {
            ...job.data.metadata,
            jobId: job.id,
            outputFile,
            scraperOutput: stdout.slice(-1000), // Last 1000 chars
            scraperErrors: stderr ? stderr.slice(-500) : null, // Last 500 chars
          },
        },
      });

      logSuccess('SCRAPING', `Scraping job ${job.id} completed successfully`);
      
      return {
        success: true,
        tendersFound,
        pagesProcessed,
        importResults,
        outputFile,
      };

    } catch (error) {
      logError('SCRAPING', `Scraping job ${job.id} failed`, error as Error);

      // Update scraping log with error
      await prisma.scrapingLog.update({
        where: { id: scrapingLogId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error instanceof Error ? {
            name: error.name,
            stack: error.stack,
          } : { error: String(error) },
        },
      });

      throw error;
    }
  }

  private async importScrapedData(
    filePath: string,
    tenantId: string,
    userId: string,
    sourcePortal: string
  ): Promise<{ imported: number; updated: number; skipped: number }> {
    const fs = await import('fs/promises');
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const tenders = JSON.parse(data);

      if (!Array.isArray(tenders)) {
        throw new Error('Invalid JSON format: expected array of tenders');
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const tenderData of tenders) {
        try {
          // Check if tender already exists
          const existingTender = await prisma.tender.findFirst({
            where: {
              tenantId,
              sourcePortal,
              externalId: tenderData.external_id || tenderData.id,
            },
          });

          const tenderPayload = {
            tenantId,
            title: tenderData.title || 'Unnamed Tender',
            description: tenderData.description || null,
            sourcePortal,
            externalId: tenderData.external_id || tenderData.id,
            originalTitle: tenderData.original_title || tenderData.title,
            originalStatus: tenderData.original_status || null,
            originalValue: tenderData.original_value || null,
            sourceUrl: tenderData.url || null,
            estimatedValue: tenderData.estimated_value ? parseFloat(tenderData.estimated_value) : null,
            currency: tenderData.currency || 'KZT',
            publishedAt: tenderData.published_at ? new Date(tenderData.published_at) : null,
            deadline: tenderData.deadline ? new Date(tenderData.deadline) : null,
            scrapedAt: new Date(),
            createdBy: userId,
            status: 'SCRAPED',
            category: this.mapCategory(tenderData.category),
            metadata: {
              scraperVersion: tenderData.scraper_version || '1.0',
              exchangeRates: tenderData.exchange_rates || null,
              rawData: tenderData,
            },
          };

          if (existingTender) {
            // Update existing tender
            await prisma.tender.update({
              where: { id: existingTender.id },
              data: {
                ...tenderPayload,
                updatedAt: new Date(),
              },
            });
            updated++;
          } else {
            // Create new tender
            const newTender = await prisma.tender.create({
              data: tenderPayload,
            });

            // Auto-assign to the user who triggered the scraping
            await prisma.tenderAssignment.create({
              data: {
                tenderId: newTender.id,
                userId,
                role: 'owner',
              },
            });

            imported++;
          }
        } catch (tenderError) {
          logError('PROCESSING', 'Error processing tender', tenderError as Error);
          skipped++;
        }
      }

      return { imported, updated, skipped };
    } catch (error) {
      logError('PROCESSING', 'Error reading/parsing scraped data', error as Error);
      throw error;
    }
  }

  private mapCategory(scraperCategory: string | undefined): any {
    const categoryMap: Record<string, any> = {
      'строительство': 'CONSTRUCTION',
      'it': 'IT_SERVICES',
      'консультации': 'CONSULTING',
      'поставки': 'SUPPLIES',
      'обслуживание': 'MAINTENANCE',
      'исследования': 'RESEARCH',
      'обучение': 'TRAINING',
    };

    if (!scraperCategory) return 'OTHER';
    
    const normalized = scraperCategory.toLowerCase();
    return categoryMap[normalized] || 'OTHER';
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job, returnvalue) => {
      logSuccess('SCRAPING', `Scraping job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      logError('SCRAPING', `Scraping job ${job?.id} failed`, err as Error);
    });

    this.worker.on('progress', (job, progress) => {
      logInfo('SCRAPING', `Scraping job ${job.id} progress: ${progress}%`);
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

// Tender Processing Worker
export class TenderProcessingWorker {
  private worker: Worker<TenderProcessingJobData>;

  constructor() {
    this.worker = new Worker<TenderProcessingJobData>(
      QUEUE_NAMES.PROCESSING,
      async (job: Job<TenderProcessingJobData>) => {
        return await this.processTender(job);
      },
      {
        connection: bullmqRedis,
        concurrency: 5, // Allow multiple processing jobs
      }
    );

    this.setupEventHandlers();
  }

  private async processTender(job: Job<TenderProcessingJobData>): Promise<any> {
    const { tenderId, tenantId, action, triggeredBy, options = {} } = job.data;

    logInfo('PROCESSING', `Processing tender ${tenderId} with action: ${action}`);

    try {
      const tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        include: {
          assignments: true,
          documents: true,
        },
      });

      if (!tender || tender.tenantId !== tenantId) {
        throw new Error('Tender not found or access denied');
      }

      let result;

      switch (action) {
        case 'validate':
          result = await this.validateTender(tender);
          break;
        case 'categorize':
          result = await this.categorizeTender(tender);
          break;
        case 'analyze':
          result = await this.analyzeTender(tender);
          break;
        case 'notify':
          result = await this.notifyTenderUpdate(tender, triggeredBy);
          break;
        default:
          throw new Error(`Unknown processing action: ${action}`);
      }

      return result;
    } catch (error) {
      logError('PROCESSING', `Tender processing failed for ${tenderId}`, error as Error);
      throw error;
    }
  }

  private async validateTender(tender: any): Promise<any> {
    // Basic validation logic
    const validationCriteria = {
      hasTitle: !!tender.title,
      hasDeadline: !!tender.deadline,
      hasEstimatedValue: !!tender.estimatedValue,
      hasDescription: !!tender.description && tender.description.length > 10,
      validDeadline: tender.deadline ? new Date(tender.deadline) > new Date() : false,
    };

    const score = Object.values(validationCriteria).filter(Boolean).length * 20; // Score out of 100

    // Create validation record
    await prisma.tenderValidation.create({
      data: {
        tenderId: tender.id,
        criteria: validationCriteria,
        score,
        isValid: score >= 60, // Consider valid if score is 60% or above
        validatedAt: new Date(),
      },
    });

    // Update tender status if validated
    if (score >= 60 && tender.status === 'SCRAPED') {
      await prisma.tender.update({
        where: { id: tender.id },
        data: { status: 'VALIDATED' },
      });

      // Create state transition
      await prisma.stateTransition.create({
        data: {
          tenderId: tender.id,
          fromStatus: 'SCRAPED',
          toStatus: 'VALIDATED',
          triggeredBy: 'system',
          reason: 'Automatic validation',
          metadata: { validationScore: score },
        },
      });
    }

    return { score, validationCriteria, isValid: score >= 60 };
  }

  private async categorizeTender(tender: any): Promise<any> {
    // Simple categorization based on title and description
    const text = `${tender.title} ${tender.description || ''}`.toLowerCase();
    
    const categoryKeywords: Record<string, string[]> = {
      CONSTRUCTION: ['строительство', 'construction', 'building', 'ремонт', 'repair'],
      IT_SERVICES: ['it', 'software', 'программирование', 'website', 'система'],
      CONSULTING: ['консультация', 'consulting', 'advisory', 'экспертиза'],
      SUPPLIES: ['поставка', 'supplies', 'equipment', 'товары', 'materials'],
      MAINTENANCE: ['обслуживание', 'maintenance', 'support', 'техподдержка'],
      RESEARCH: ['исследование', 'research', 'анализ', 'study'],
      TRAINING: ['обучение', 'training', 'образование', 'курсы'],
    };

    let bestCategory = 'OTHER';
    let maxScore = 0;

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      const score = keywords.reduce((acc, keyword) => {
        return acc + (text.includes(keyword) ? 1 : 0);
      }, 0);

      if (score > maxScore) {
        maxScore = score;
        bestCategory = category as any;
      }
    }

    // Update tender category if we found a good match
    if (maxScore > 0 && tender.category === 'OTHER') {
      await prisma.tender.update({
        where: { id: tender.id },
        data: { category: bestCategory },
      });
    }

    return { category: bestCategory, confidence: maxScore, keywords: categoryKeywords[bestCategory] };
  }

  private async analyzeTender(tender: any): Promise<any> {
    // Basic tender analysis
    const analysis = {
      competitiveness: this.assessCompetitiveness(tender),
      urgency: this.assessUrgency(tender),
      complexity: this.assessComplexity(tender),
      recommendations: this.getRecommendations(tender),
    };

    return analysis;
  }

  private assessCompetitiveness(tender: any): { level: string; score: number; factors: string[] } {
    const factors = [];
    let score = 50; // Base score

    if (tender.estimatedValue) {
      if (tender.estimatedValue > 10000000) { // Large tender
        score += 20;
        factors.push('High-value contract increases competition');
      } else if (tender.estimatedValue < 100000) { // Small tender
        score -= 10;
        factors.push('Lower-value contract may have less competition');
      }
    }

    const daysUntilDeadline = tender.deadline 
      ? Math.ceil((new Date(tender.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    if (daysUntilDeadline) {
      if (daysUntilDeadline < 7) {
        score -= 15;
        factors.push('Short deadline may deter some competitors');
      } else if (daysUntilDeadline > 30) {
        score += 15;
        factors.push('Long deadline allows more competitors to prepare');
      }
    }

    let level = 'Medium';
    if (score >= 70) level = 'High';
    else if (score <= 40) level = 'Low';

    return { level, score, factors };
  }

  private assessUrgency(tender: any): { level: string; daysLeft: number | null } {
    if (!tender.deadline) return { level: 'Unknown', daysLeft: null };

    const daysLeft = Math.ceil((new Date(tender.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    let level = 'Medium';
    if (daysLeft <= 3) level = 'Critical';
    else if (daysLeft <= 7) level = 'High';
    else if (daysLeft <= 14) level = 'Medium';
    else level = 'Low';

    return { level, daysLeft };
  }

  private assessComplexity(tender: any): { level: string; factors: string[] } {
    const factors = [];
    let complexityScore = 0;

    // Check title/description for complexity indicators
    const text = `${tender.title} ${tender.description || ''}`.toLowerCase();
    
    const complexityKeywords = [
      'integration', 'интеграция',
      'custom', 'кастомный',
      'complex', 'сложный',
      'multiple', 'множественный',
      'enterprise', 'корпоративный'
    ];

    complexityKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        complexityScore += 1;
        factors.push(`Contains keyword: ${keyword}`);
      }
    });

    if (tender.estimatedValue > 5000000) {
      complexityScore += 2;
      factors.push('High value suggests complex requirements');
    }

    let level = 'Low';
    if (complexityScore >= 4) level = 'High';
    else if (complexityScore >= 2) level = 'Medium';

    return { level, factors };
  }

  private getRecommendations(tender: any): string[] {
    const recommendations = [];

    if (!tender.deadline) {
      recommendations.push('Request deadline clarification from client');
    } else {
      const daysLeft = Math.ceil((new Date(tender.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) {
        recommendations.push('Urgent: Prioritize this tender due to approaching deadline');
      }
    }

    if (!tender.estimatedValue) {
      recommendations.push('Contact client to understand budget expectations');
    }

    if (!tender.description || tender.description.length < 50) {
      recommendations.push('Request detailed requirements from client');
    }

    if (tender.documents && tender.documents.length === 0) {
      recommendations.push('Look for additional tender documents and specifications');
    }

    return recommendations;
  }

  private async notifyTenderUpdate(tender: any, userId: string): Promise<any> {
    // Create notifications for all users assigned to the tender
    const assignments = tender.assignments || [];
    
    for (const assignment of assignments) {
      if (assignment.userId !== userId) { // Don't notify the person who triggered the update
        await prisma.notification.create({
          data: {
            userId: assignment.userId,
            tenderId: tender.id,
            type: 'TENDER_STATUS_CHANGED',
            title: `Tender Updated: ${tender.title}`,
            message: `The tender "${tender.title}" has been updated and requires your attention.`,
            data: {
              tenderId: tender.id,
              previousStatus: tender.status,
              triggeredBy: userId,
            },
          },
        });
      }
    }

    return { notificationsSent: assignments.length - 1 };
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job, returnvalue) => {
      logSuccess('PROCESSING', `Tender processing job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      logError('PROCESSING', `Tender processing job ${job?.id} failed`, err as Error);
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

// Notification Worker
export class NotificationWorker {
  private worker: Worker<NotificationJobData>;

  constructor() {
    this.worker = new Worker<NotificationJobData>(
      QUEUE_NAMES.NOTIFICATIONS,
      async (job: Job<NotificationJobData>) => {
        return await this.processNotification(job);
      },
      {
        connection: bullmqRedis,
        concurrency: 10, // Allow many concurrent notifications
      }
    );
  }

  private async processNotification(job: Job<NotificationJobData>): Promise<any> {
    const { userId, tenantId, type, data } = job.data;

    logInfo('NOTIFICATION', `Processing notification: ${type} for tenant ${tenantId}`);

    // For now, we'll just log notifications
    // In a real implementation, you'd send emails, push notifications, etc.
    
    if (userId) {
      logInfo('NOTIFICATION', `Notification for user ${userId}: ${type}`);
    } else {
      logInfo('NOTIFICATION', `Broadcast notification for tenant ${tenantId}: ${type}`);
    }

    return { sent: true, type, timestamp: new Date() };
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

// Worker Manager
export class WorkerManager {
  private workers: {
    scraping: ScrapingWorker;
    processing: TenderProcessingWorker;
    notifications: NotificationWorker;
  };

  constructor() {
    logInfo('STARTUP', 'Starting BullMQ workers...');
    
    this.workers = {
      scraping: new ScrapingWorker(),
      processing: new TenderProcessingWorker(),
      notifications: new NotificationWorker(),
    };

    logSuccess('STARTUP', 'All BullMQ workers started');
  }

  async shutdown(): Promise<void> {
    logInfo('SHUTDOWN', 'Shutting down BullMQ workers...');
    
    await Promise.all([
      this.workers.scraping.close(),
      this.workers.processing.close(),
      this.workers.notifications.close(),
    ]);

    logSuccess('SHUTDOWN', 'All BullMQ workers shut down');
  }
}

export default WorkerManager;