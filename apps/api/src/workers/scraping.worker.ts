import { Worker, Job } from 'bullmq';
import { bullmqRedis } from '../services/redis';
import { prisma } from '../database/client';
import { createLogger, logInfo, logError, logSuccess } from '../utils/logger';
import { DataTransformer } from '../services/data-transformer';
import { ScrapingJobData, QUEUE_NAMES } from '../services/queue';
import axios from 'axios';

const logger = createLogger('SCRAPING_WORKER');

interface ScraperResult {
  tenders: any[];
  totalPages: number;
  totalTenders: number;
  executionTime: number;
}

export const scrapingWorker = new Worker<ScrapingJobData>(
  QUEUE_NAMES.SCRAPING,
  async (job: Job<ScrapingJobData>) => {
    const { tenantId, sourcePortal, triggeredBy, options } = job.data;
    const scrapingLogId = (job.data as any).scrapingLogId;
    
    logInfo('WORKER', `Starting scraping job ${job.id} for ${sourcePortal}`);
    
    try {
      await job.updateProgress(10);
      
      if (scrapingLogId) {
        await prisma.scrapingLog.update({
          where: { id: scrapingLogId },
          data: {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          },
        });
      }

      await job.updateProgress(20);
      
      const scraperUrl = process.env.SCRAPER_URL || 'http://localhost:3002';
      const response = await axios.post(`${scraperUrl}/api/scrape`, {
        portal: sourcePortal,
        maxPages: options?.maxPages || 10,
        startDate: options?.startDate,
        endDate: options?.endDate,
        categories: options?.categories,
        forceRefresh: options?.forceRefresh,
      }, {
        timeout: 300000,
      });

      const scraperResult: ScraperResult = response.data;
      
      await job.updateProgress(50);
      
      let processedCount = 0;
      let failedCount = 0;
      const newTenderIds: string[] = [];
      
      for (const rawTender of scraperResult.tenders) {
        try {
          const transformedTender = await DataTransformer.transformScrapedTender(rawTender);
          
          const existingTender = await prisma.tender.findFirst({
            where: {
              externalId: transformedTender.externalId,
              tenantId,
            },
          });
          
          if (!existingTender) {
            const createdTender = await prisma.tender.create({
              data: {
                ...transformedTender,
                tenantId,
                status: 'SCRAPED',
                scrapedAt: new Date(),
                sourcePortal,
                metadata: {
                  ...(transformedTender.metadata || {}),
                  scrapingJobId: job.id?.toString(),
                  scrapingLogId,
                },
              },
            });
            
            newTenderIds.push(createdTender.id);
            processedCount++;
          } else {
            await prisma.tender.update({
              where: { id: existingTender.id },
              data: {
                ...transformedTender,
                status: 'UPDATED',
                scrapedAt: new Date(),
                metadata: {
                  ...(transformedTender.metadata || {}),
                  lastScrapingJobId: job.id?.toString(),
                  lastScrapingLogId: scrapingLogId,
                },
              },
            });
            
            processedCount++;
          }
          
          const progress = 50 + Math.floor((processedCount / scraperResult.tenders.length) * 40);
          await job.updateProgress(progress);
          
        } catch (error) {
          logError('PROCESSING', `Failed to process tender: ${rawTender.referenceNumber}`, error as Error);
          failedCount++;
        }
      }
      
      await job.updateProgress(95);
      
      if (scrapingLogId) {
        await prisma.scrapingLog.update({
          where: { id: scrapingLogId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            tendersFound: scraperResult.totalTenders,
            tendersProcessed: processedCount,
            tendersFailed: failedCount,
            metadata: {
              newTenderIds,
              totalPages: scraperResult.totalPages,
              executionTime: scraperResult.executionTime,
              sourcePortal,
            },
          },
        });
      }
      
      await prisma.auditLog.create({
        data: {
          action: 'SCRAPING_COMPLETED',
          entityType: 'TENDER',
          entityId: scrapingLogId || job.id?.toString(),
          userId: triggeredBy,
          tenantId,
          metadata: {
            jobId: job.id,
            portal: sourcePortal,
            tendersProcessed: processedCount,
            tendersFailed: failedCount,
          },
        },
      });
      
      logSuccess('WORKER', `Scraping job ${job.id} completed: ${processedCount} processed, ${failedCount} failed`);
      
      return {
        success: true,
        processedCount,
        failedCount,
        newTenderIds,
        totalTenders: scraperResult.totalTenders,
        executionTime: scraperResult.executionTime,
      };
      
    } catch (error) {
      logError('WORKER', `Scraping job ${job.id} failed`, error as Error);
      
      if (scrapingLogId) {
        await prisma.scrapingLog.update({
          where: { id: scrapingLogId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            metadata: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          },
        });
      }
      
      throw error;
    }
  },
  {
    connection: bullmqRedis,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 60000,
    },
  }
);

scrapingWorker.on('completed', (job) => {
  logSuccess('WORKER', `Job ${job.id} completed successfully`);
});

scrapingWorker.on('failed', (job, err) => {
  logError('WORKER', `Job ${job?.id} failed`, err);
});

scrapingWorker.on('error', (err) => {
  logError('WORKER', 'Worker error', err);
});

export default scrapingWorker;