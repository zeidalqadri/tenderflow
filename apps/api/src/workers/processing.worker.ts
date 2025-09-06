import { Worker, Job } from 'bullmq';
import { bullmqRedis } from '../services/redis';
import { prisma } from '../database/client';
import { createLogger, logInfo, logError, logSuccess } from '../utils/logger';
import { TenderProcessingJobData, QUEUE_NAMES, JobScheduler } from '../services/queue';
import { DataTransformer } from '../services/data-transformer';
import { CacheManager } from '../services/redis';

const logger = createLogger('PROCESSING_WORKER');

export const processingWorker = new Worker<TenderProcessingJobData>(
  QUEUE_NAMES.PROCESSING,
  async (job: Job<TenderProcessingJobData>) => {
    const { tenderId, tenantId, action, triggeredBy, options } = job.data;
    
    logInfo('WORKER', `Processing tender ${tenderId} - Action: ${action}`);
    
    try {
      const tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        include: {
          documents: true,
          tags: true,
        },
      });
      
      if (!tender) {
        throw new Error(`Tender ${tenderId} not found`);
      }
      
      await job.updateProgress(20);
      
      switch (action) {
        case 'validate':
          await processTenderValidation(tender, triggeredBy);
          await job.updateProgress(50);
          
          await JobScheduler.scheduleProcessing({
            tenderId,
            tenantId,
            action: 'categorize',
            triggeredBy,
          }, { delay: 1000 });
          break;
          
        case 'categorize':
          await processTenderCategorization(tender);
          await job.updateProgress(50);
          
          await JobScheduler.scheduleProcessing({
            tenderId,
            tenantId,
            action: 'analyze',
            triggeredBy,
          }, { delay: 1000 });
          break;
          
        case 'analyze':
          await processTenderAnalysis(tender);
          await job.updateProgress(50);
          
          if (tender.priority === 'HIGH' || tender.priority === 'CRITICAL') {
            await JobScheduler.scheduleNotification({
              tenantId,
              type: 'tender_update',
              data: {
                tenderId,
                title: tender.title,
                priority: tender.priority,
                deadline: tender.closingDate,
              },
              priority: 'high',
            });
          }
          break;
          
        case 'notify':
          await JobScheduler.scheduleNotification({
            userId: triggeredBy,
            tenantId,
            type: 'tender_update',
            data: {
              tenderId,
              title: tender.title,
              status: tender.status,
              ...options,
            },
          });
          break;
          
        default:
          throw new Error(`Unknown processing action: ${action}`);
      }
      
      await job.updateProgress(80);
      
      await CacheManager.invalidatePattern(`tender:${tenderId}:*`);
      await CacheManager.invalidatePattern(`tenant:${tenantId}:tenders:*`);
      
      await prisma.auditLog.create({
        data: {
          action: `TENDER_${action.toUpperCase()}`,
          entityType: 'TENDER',
          entityId: tenderId,
          userId: triggeredBy,
          tenantId,
          metadata: {
            jobId: job.id,
            previousStatus: tender.status,
            action,
          },
        },
      });
      
      await job.updateProgress(100);
      
      logSuccess('WORKER', `Tender ${tenderId} processed successfully - Action: ${action}`);
      
      return {
        success: true,
        tenderId,
        action,
        status: tender.status,
      };
      
    } catch (error) {
      logError('WORKER', `Processing job ${job.id} failed`, error as Error);
      throw error;
    }
  },
  {
    connection: bullmqRedis,
    concurrency: 5,
  }
);

async function processTenderValidation(tender: any, userId: string) {
  const validationRules = [
    { field: 'title', required: true, minLength: 10 },
    { field: 'description', required: true, minLength: 50 },
    { field: 'value', required: false, min: 0 },
    { field: 'closingDate', required: true },
    { field: 'organization', required: true },
  ];
  
  const validationErrors: string[] = [];
  let validationScore = 100;
  
  for (const rule of validationRules) {
    const value = tender[rule.field];
    
    if (rule.required && !value) {
      validationErrors.push(`Missing required field: ${rule.field}`);
      validationScore -= 20;
    }
    
    if (rule.minLength && value && value.length < rule.minLength) {
      validationErrors.push(`${rule.field} too short (minimum ${rule.minLength} characters)`);
      validationScore -= 10;
    }
    
    if (rule.min !== undefined && value < rule.min) {
      validationErrors.push(`${rule.field} below minimum value (${rule.min})`);
      validationScore -= 10;
    }
  }
  
  const isValid = validationErrors.length === 0;
  const newStatus = isValid ? 'VALIDATED' : 'VALIDATION_FAILED';
  
  await prisma.tender.update({
    where: { id: tender.id },
    data: {
      status: newStatus,
      validationScore,
      metadata: {
        ...tender.metadata,
        validationErrors,
        validatedAt: new Date(),
        validatedBy: userId,
      },
    },
  });
  
  return { isValid, validationScore, validationErrors };
}

async function processTenderCategorization(tender: any) {
  const categories = await DataTransformer.detectCategories(tender.title, tender.description);
  const mainCategory = categories[0] || 'general';
  
  const similarTenders = await prisma.tender.findMany({
    where: {
      tenantId: tender.tenantId,
      category: mainCategory,
      id: { not: tender.id },
      status: { in: ['WON', 'LOST'] },
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  
  const winRate = similarTenders.length > 0
    ? (similarTenders.filter(t => t.status === 'WON').length / similarTenders.length) * 100
    : 50;
  
  const competitionLevel = await analyzeCompetitionLevel(tender);
  
  await prisma.tender.update({
    where: { id: tender.id },
    data: {
      category: mainCategory,
      tags: {
        connectOrCreate: categories.map(cat => ({
          where: { name: cat },
          create: { name: cat },
        })),
      },
      metadata: {
        ...tender.metadata,
        categories,
        winRate,
        competitionLevel,
        categorizedAt: new Date(),
      },
    },
  });
  
  return { category: mainCategory, categories, winRate, competitionLevel };
}

async function processTenderAnalysis(tender: any) {
  const aiScore = DataTransformer.calculateAIScore(tender);
  const priority = DataTransformer.calculatePriority(tender);
  
  const complexityScore = calculateComplexityScore(tender);
  const riskScore = calculateRiskScore(tender);
  const opportunityScore = calculateOpportunityScore(tender);
  
  const recommendedBidAmount = tender.value ? tender.value * 0.95 : null;
  const estimatedEffort = estimateEffortHours(tender);
  
  await prisma.tender.update({
    where: { id: tender.id },
    data: {
      aiScore,
      priority,
      status: 'ANALYZED',
      metadata: {
        ...tender.metadata,
        complexityScore,
        riskScore,
        opportunityScore,
        recommendedBidAmount,
        estimatedEffort,
        analyzedAt: new Date(),
      },
    },
  });
  
  return {
    aiScore,
    priority,
    complexityScore,
    riskScore,
    opportunityScore,
    recommendedBidAmount,
    estimatedEffort,
  };
}

function analyzeCompetitionLevel(tender: any): string {
  const value = tender.value || 0;
  const daysUntilDeadline = tender.closingDate
    ? Math.ceil((new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;
  
  if (value > 10000000 || daysUntilDeadline < 7) return 'HIGH';
  if (value > 1000000 || daysUntilDeadline < 14) return 'MEDIUM';
  return 'LOW';
}

function calculateComplexityScore(tender: any): number {
  let score = 50;
  
  const descLength = tender.description?.length || 0;
  if (descLength > 5000) score += 30;
  else if (descLength > 2000) score += 20;
  else if (descLength > 500) score += 10;
  
  const docCount = tender.documents?.length || 0;
  if (docCount > 10) score += 20;
  else if (docCount > 5) score += 10;
  
  return Math.min(100, score);
}

function calculateRiskScore(tender: any): number {
  let score = 0;
  
  const daysUntilDeadline = tender.closingDate
    ? Math.ceil((new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;
  
  if (daysUntilDeadline < 3) score += 40;
  else if (daysUntilDeadline < 7) score += 25;
  else if (daysUntilDeadline < 14) score += 10;
  
  const value = tender.value || 0;
  if (value > 10000000) score += 30;
  else if (value > 5000000) score += 20;
  else if (value > 1000000) score += 10;
  
  if (!tender.organization) score += 20;
  if (!tender.description || tender.description.length < 100) score += 10;
  
  return Math.min(100, score);
}

function calculateOpportunityScore(tender: any): number {
  let score = 50;
  
  const value = tender.value || 0;
  if (value > 5000000) score += 30;
  else if (value > 1000000) score += 20;
  else if (value > 100000) score += 10;
  
  const daysUntilDeadline = tender.closingDate
    ? Math.ceil((new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;
  
  if (daysUntilDeadline > 30) score += 20;
  else if (daysUntilDeadline > 14) score += 10;
  
  return Math.min(100, score);
}

function estimateEffortHours(tender: any): number {
  let baseHours = 40;
  
  const value = tender.value || 0;
  if (value > 10000000) baseHours += 160;
  else if (value > 5000000) baseHours += 120;
  else if (value > 1000000) baseHours += 80;
  else if (value > 100000) baseHours += 40;
  
  const complexity = calculateComplexityScore(tender);
  baseHours += Math.floor(complexity * 2);
  
  return baseHours;
}

processingWorker.on('completed', (job) => {
  logSuccess('WORKER', `Job ${job.id} completed successfully`);
});

processingWorker.on('failed', (job, err) => {
  logError('WORKER', `Job ${job?.id} failed`, err);
});

export default processingWorker;