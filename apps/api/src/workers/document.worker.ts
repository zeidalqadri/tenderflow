import { Worker, Job } from 'bullmq';
import { bullmqRedis } from '../services/redis';
import { prisma } from '../database/client';
import { createLogger, logInfo, logError, logSuccess } from '../utils/logger';
import { DocumentProcessingJobData, QUEUE_NAMES } from '../services/queue';
import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('DOCUMENT_WORKER');

export const documentWorker = new Worker<DocumentProcessingJobData>(
  QUEUE_NAMES.DOCUMENTS,
  async (job: Job<DocumentProcessingJobData>) => {
    const { documentId, tenantId, action, triggeredBy, options } = job.data;
    
    logInfo('WORKER', `Processing document ${documentId} - Action: ${action}`);
    
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          tender: true,
        },
      });
      
      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }
      
      await job.updateProgress(20);
      
      let result: any = {};
      
      switch (action) {
        case 'ocr':
          result = await performOCR(document);
          await job.updateProgress(60);
          break;
          
        case 'parse':
          result = await parseDocument(document);
          await job.updateProgress(60);
          break;
          
        case 'analyze':
          result = await analyzeDocument(document);
          await job.updateProgress(60);
          break;
          
        case 'extract':
          result = await extractKeyInformation(document);
          await job.updateProgress(60);
          break;
          
        default:
          throw new Error(`Unknown document action: ${action}`);
      }
      
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processedAt: new Date(),
          metadata: {
            ...document.metadata,
            [action]: result,
            processedBy: triggeredBy,
            processingJobId: job.id,
          },
        },
      });
      
      await job.updateProgress(80);
      
      if (document.tenderId) {
        await prisma.tender.update({
          where: { id: document.tenderId },
          data: {
            metadata: {
              ...document.tender?.metadata,
              documentsProcessed: true,
              lastDocumentProcessedAt: new Date(),
            },
          },
        });
      }
      
      await prisma.auditLog.create({
        data: {
          action: `DOCUMENT_${action.toUpperCase()}`,
          entityType: 'DOCUMENT',
          entityId: documentId,
          userId: triggeredBy,
          tenantId,
          metadata: {
            jobId: job.id,
            action,
            fileName: document.fileName,
            fileType: document.fileType,
          },
        },
      });
      
      await job.updateProgress(100);
      
      logSuccess('WORKER', `Document ${documentId} processed successfully - Action: ${action}`);
      
      return {
        success: true,
        documentId,
        action,
        result,
      };
      
    } catch (error) {
      logError('WORKER', `Document job ${job.id} failed`, error as Error);
      throw error;
    }
  },
  {
    connection: bullmqRedis,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

async function performOCR(document: any): Promise<any> {
  try {
    const filePath = document.filePath || path.join(process.env.UPLOAD_DIR || './uploads', document.fileName);
    
    const fileBuffer = await fs.readFile(filePath);
    
    const { data: { text, confidence, words } } = await Tesseract.recognize(
      fileBuffer,
      'eng+rus+kaz',
      {
        logger: (m) => logInfo('OCR', `${m.status}: ${Math.round(m.progress * 100)}%`),
      }
    );
    
    const extractedData = extractStructuredData(text);
    
    return {
      text,
      confidence,
      wordCount: words?.length || 0,
      extractedData,
      language: detectLanguage(text),
      processedAt: new Date(),
    };
  } catch (error) {
    logError('OCR', 'OCR processing failed', error as Error);
    throw error;
  }
}

async function parseDocument(document: any): Promise<any> {
  try {
    const filePath = document.filePath || path.join(process.env.UPLOAD_DIR || './uploads', document.fileName);
    
    if (document.fileType === 'application/pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      
      return {
        text: pdfData.text,
        pageCount: pdfData.numpages,
        info: pdfData.info,
        metadata: pdfData.metadata,
        version: pdfData.version,
        extractedTables: extractTables(pdfData.text),
        extractedNumbers: extractNumbers(pdfData.text),
      };
    } else if (document.fileType?.includes('text')) {
      const text = await fs.readFile(filePath, 'utf-8');
      
      return {
        text,
        lineCount: text.split('\n').length,
        wordCount: text.split(/\s+/).length,
        characterCount: text.length,
      };
    } else {
      return {
        fileType: document.fileType,
        message: 'Document type requires specialized parsing',
      };
    }
  } catch (error) {
    logError('PARSE', 'Document parsing failed', error as Error);
    throw error;
  }
}

async function analyzeDocument(document: any): Promise<any> {
  const analysis: any = {
    documentType: detectDocumentType(document),
    completeness: 100,
    issues: [],
    suggestions: [],
  };
  
  if (!document.fileName) {
    analysis.issues.push('Missing file name');
    analysis.completeness -= 10;
  }
  
  if (!document.fileType) {
    analysis.issues.push('Missing file type');
    analysis.completeness -= 10;
  }
  
  if (document.fileSize > 10 * 1024 * 1024) {
    analysis.issues.push('Large file size (>10MB)');
    analysis.suggestions.push('Consider compressing the document');
  }
  
  const metadata = document.metadata || {};
  
  if (metadata.ocr?.text) {
    const text = metadata.ocr.text;
    
    const dates = extractDates(text);
    const amounts = extractAmounts(text);
    const organizations = extractOrganizations(text);
    
    analysis.extractedData = {
      dates,
      amounts,
      organizations,
      keyTerms: extractKeyTerms(text),
    };
    
    if (dates.length === 0) {
      analysis.suggestions.push('No dates found - verify document completeness');
    }
    
    if (amounts.length === 0 && document.tender?.value) {
      analysis.suggestions.push('No amounts found - verify pricing information');
    }
  }
  
  analysis.relevanceScore = calculateRelevanceScore(document, analysis);
  
  return analysis;
}

async function extractKeyInformation(document: any): Promise<any> {
  const text = document.metadata?.ocr?.text || document.metadata?.parse?.text || '';
  
  if (!text) {
    return {
      error: 'No text available for extraction',
      suggestion: 'Run OCR or parse action first',
    };
  }
  
  return {
    contactInfo: extractContactInfo(text),
    requirements: extractRequirements(text),
    deliverables: extractDeliverables(text),
    timeline: extractTimeline(text),
    budget: extractBudget(text),
    legalTerms: extractLegalTerms(text),
    technicalSpecs: extractTechnicalSpecs(text),
  };
}

function extractStructuredData(text: string): any {
  const lines = text.split('\n');
  const data: any = {};
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && colonIndex < line.length - 1) {
      const key = line.substring(0, colonIndex).trim().toLowerCase().replace(/\s+/g, '_');
      const value = line.substring(colonIndex + 1).trim();
      if (key && value) {
        data[key] = value;
      }
    }
  }
  
  return data;
}

function detectLanguage(text: string): string {
  const cyrillicPattern = /[а-яА-Я]/g;
  const latinPattern = /[a-zA-Z]/g;
  
  const cyrillicCount = (text.match(cyrillicPattern) || []).length;
  const latinCount = (text.match(latinPattern) || []).length;
  
  if (cyrillicCount > latinCount * 2) return 'ru';
  if (latinCount > cyrillicCount * 2) return 'en';
  return 'mixed';
}

function extractTables(text: string): any[] {
  const tables: any[] = [];
  const lines = text.split('\n');
  
  let currentTable: string[] = [];
  let inTable = false;
  
  for (const line of lines) {
    const cellCount = (line.match(/\t|\|/g) || []).length;
    
    if (cellCount >= 2) {
      if (!inTable) {
        inTable = true;
        currentTable = [];
      }
      currentTable.push(line);
    } else if (inTable && currentTable.length > 1) {
      tables.push({
        rows: currentTable.length,
        content: currentTable,
      });
      inTable = false;
      currentTable = [];
    }
  }
  
  return tables;
}

function extractNumbers(text: string): number[] {
  const numberPattern = /\d+([.,]\d+)?/g;
  const matches = text.match(numberPattern) || [];
  return matches.map(m => parseFloat(m.replace(',', '.')));
}

function detectDocumentType(document: any): string {
  const fileName = document.fileName?.toLowerCase() || '';
  const text = document.metadata?.ocr?.text?.toLowerCase() || '';
  
  if (fileName.includes('rfp') || text.includes('request for proposal')) return 'RFP';
  if (fileName.includes('rfq') || text.includes('request for quotation')) return 'RFQ';
  if (fileName.includes('rfi') || text.includes('request for information')) return 'RFI';
  if (fileName.includes('sow') || text.includes('statement of work')) return 'SOW';
  if (fileName.includes('contract') || text.includes('agreement')) return 'CONTRACT';
  if (fileName.includes('spec') || text.includes('specification')) return 'SPECIFICATION';
  if (fileName.includes('tender') || text.includes('tender')) return 'TENDER';
  
  return 'GENERAL';
}

function extractDates(text: string): string[] {
  const datePatterns = [
    /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g,
    /\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/g,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/gi,
  ];
  
  const dates: string[] = [];
  for (const pattern of datePatterns) {
    const matches = text.match(pattern) || [];
    dates.push(...matches);
  }
  
  return [...new Set(dates)];
}

function extractAmounts(text: string): any[] {
  const amountPattern = /(?:[\$€£¥₽₸]\s*)?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)/g;
  const matches = text.matchAll(amountPattern);
  
  const amounts: any[] = [];
  for (const match of matches) {
    const value = parseFloat(match[1].replace(/[,\s]/g, ''));
    if (value > 100) {
      amounts.push({
        value,
        original: match[0],
        currency: match[0].match(/[\$€£¥₽₸]/)?.[0] || 'USD',
      });
    }
  }
  
  return amounts;
}

function extractOrganizations(text: string): string[] {
  const orgPatterns = [
    /(?:Company|Corporation|Inc\.|Ltd\.|LLC|LLP|GmbH|JSC|TOO|ТОО|АО)\s*:?\s*([A-Z][A-Za-z\s&]+)/g,
    /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3})(?:\s+(?:Company|Corporation|Inc\.|Ltd\.|LLC|LLP|GmbH|JSC|TOO|ТОО|АО))/g,
  ];
  
  const orgs: string[] = [];
  for (const pattern of orgPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      orgs.push(match[1].trim());
    }
  }
  
  return [...new Set(orgs)];
}

function extractKeyTerms(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  
  const wordFreq = new Map<string, number>();
  for (const word of words) {
    if (!stopWords.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }
  
  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function calculateRelevanceScore(document: any, analysis: any): number {
  let score = 50;
  
  if (analysis.documentType !== 'GENERAL') score += 20;
  if (analysis.extractedData?.dates?.length > 0) score += 10;
  if (analysis.extractedData?.amounts?.length > 0) score += 10;
  if (analysis.completeness > 80) score += 10;
  
  return Math.min(100, score);
}

function extractContactInfo(text: string): any {
  const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/g;
  const phonePattern = /(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/g;
  
  return {
    emails: text.match(emailPattern) || [],
    phones: text.match(phonePattern) || [],
  };
}

function extractRequirements(text: string): string[] {
  const requirementPatterns = [
    /(?:must|shall|required to|need to|should)\s+([^.]+)/gi,
    /(?:requirement|criteria):\s*([^.]+)/gi,
  ];
  
  const requirements: string[] = [];
  for (const pattern of requirementPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      requirements.push(match[1].trim());
    }
  }
  
  return requirements.slice(0, 20);
}

function extractDeliverables(text: string): string[] {
  const deliverablePatterns = [
    /(?:deliverable|output|result)s?:\s*([^.]+)/gi,
    /(?:provide|deliver|submit)\s+([^.]+)/gi,
  ];
  
  const deliverables: string[] = [];
  for (const pattern of deliverablePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      deliverables.push(match[1].trim());
    }
  }
  
  return deliverables.slice(0, 15);
}

function extractTimeline(text: string): any {
  const dates = extractDates(text);
  const durations = text.match(/\d+\s+(?:days?|weeks?|months?)/gi) || [];
  
  return {
    dates,
    durations,
    milestones: extractMilestones(text),
  };
}

function extractMilestones(text: string): string[] {
  const milestonePatterns = [
    /(?:milestone|phase|stage)\s*\d*:?\s*([^.]+)/gi,
    /(?:by|before|until|deadline)\s+([^.]+)/gi,
  ];
  
  const milestones: string[] = [];
  for (const pattern of milestonePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      milestones.push(match[1].trim());
    }
  }
  
  return milestones.slice(0, 10);
}

function extractBudget(text: string): any {
  const amounts = extractAmounts(text);
  const budgetKeywords = ['budget', 'cost', 'price', 'value', 'amount'];
  
  const budgetAmounts = amounts.filter(amount => {
    const contextStart = Math.max(0, text.indexOf(amount.original) - 50);
    const contextEnd = Math.min(text.length, text.indexOf(amount.original) + amount.original.length + 50);
    const context = text.substring(contextStart, contextEnd).toLowerCase();
    
    return budgetKeywords.some(keyword => context.includes(keyword));
  });
  
  return {
    amounts: budgetAmounts,
    total: budgetAmounts.reduce((sum, a) => sum + a.value, 0),
    currency: budgetAmounts[0]?.currency || 'USD',
  };
}

function extractLegalTerms(text: string): string[] {
  const legalPatterns = [
    /(?:term|condition|clause|provision)s?:\s*([^.]+)/gi,
    /(?:warranty|liability|indemnity|confidential)\s+([^.]+)/gi,
  ];
  
  const terms: string[] = [];
  for (const pattern of legalPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      terms.push(match[1].trim());
    }
  }
  
  return terms.slice(0, 10);
}

function extractTechnicalSpecs(text: string): any {
  const specs: any = {
    technologies: [],
    standards: [],
    requirements: [],
  };
  
  const techPattern = /(?:technology|platform|framework|language|database|api|system):\s*([^.,\n]+)/gi;
  const techMatches = text.matchAll(techPattern);
  for (const match of techMatches) {
    specs.technologies.push(match[1].trim());
  }
  
  const standardPattern = /(?:ISO|IEEE|ANSI|standard|compliance)\s+[\d\w-]+/gi;
  specs.standards = text.match(standardPattern) || [];
  
  const requirementPattern = /(?:minimum|maximum|required)\s+([^.]+)/gi;
  const reqMatches = text.matchAll(requirementPattern);
  for (const match of reqMatches) {
    specs.requirements.push(match[1].trim());
  }
  
  return specs;
}

documentWorker.on('completed', (job) => {
  logSuccess('WORKER', `Job ${job.id} completed successfully`);
});

documentWorker.on('failed', (job, err) => {
  logError('WORKER', `Job ${job?.id} failed`, err);
});

export default documentWorker;