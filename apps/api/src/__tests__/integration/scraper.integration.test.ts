/**
 * Kazakhstan Scraper Integration Tests
 * Tests the complete data flow from Python scraper to database to API
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { prisma } from '../../database/client';
import { ScraperService } from '../../services/scraper/scraper.service';
import { TransformerService } from '../../services/scraper/transformer.service';
import { WebSocketService } from '../../services/websocket';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { createTestServer } from '../helpers/test-server';

// Mock CSV data for testing
const MOCK_CSV_DATA = `id,title,status,days_left,value,url
123456,Поставка компьютерного оборудования,Открытый тендер,15 дней,5000000 ₸,https://zakup.sk.kz/test1
789012,Строительство офисного здания,Открытый тендер,30 дней,50000000 ₸,https://zakup.sk.kz/test2
345678,Консультационные услуги по IT,Запрос ценовых предложений,7 дней,2500000 ₸,https://zakup.sk.kz/test3`;

describe('Kazakhstan Scraper Integration', () => {
  let testServer: FastifyInstance;
  let scraperService: ScraperService;
  let transformerService: TransformerService;
  let websocketService: WebSocketService;
  let tenantId: string;
  let userId: string;
  let mockCsvPath: string;

  beforeAll(async () => {
    // Create test server
    testServer = await createTestServer();
    
    // Initialize services
    websocketService = new WebSocketService(testServer);
    scraperService = new ScraperService(prisma, websocketService);
    transformerService = new TransformerService(prisma);

    // Create test tenant and user
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Scraper Tenant',
        subdomain: 'scraper-test',
        settings: {}
      }
    });
    tenantId = tenant.id;

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: 'scraper-test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin'
      }
    });
    userId = user.id;

    // Create mock CSV file for testing
    mockCsvPath = join(process.cwd(), 'test-tender-data.csv');
    writeFileSync(mockCsvPath, MOCK_CSV_DATA);
  });

  afterAll(async () => {
    // Cleanup
    if (existsSync(mockCsvPath)) {
      unlinkSync(mockCsvPath);
    }
    
    await prisma.tender.deleteMany({ where: { tenantId } });
    await prisma.scrapingLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    
    await testServer.close();
  });

  beforeEach(async () => {
    // Clean up tenders before each test
    await prisma.tender.deleteMany({ where: { tenantId } });
    await prisma.scrapingLog.deleteMany({ where: { tenantId } });
  });

  describe('Data Transformation', () => {
    it('should transform scraped CSV data correctly', async () => {
      const result = await transformerService.processScrapedData(
        mockCsvPath,
        tenantId,
        userId
      );

      expect(result.imported).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);

      // Verify tenders were created
      const tenders = await prisma.tender.findMany({
        where: { tenantId },
        orderBy: { externalId: 'asc' }
      });

      expect(tenders).toHaveLength(3);

      // Check first tender (Computer equipment)
      const firstTender = tenders.find(t => t.externalId === '123456');
      expect(firstTender).toBeDefined();
      expect(firstTender!.originalTitle).toBe('Поставка компьютерного оборудования');
      expect(firstTender!.category).toBe('IT_SERVICES');
      expect(firstTender!.sourcePortal).toBe('zakup.sk.kz');
      expect(firstTender!.currency).toBe('USD');
      expect(Number(firstTender!.estimatedValue)).toBeCloseTo(10000, 0); // ~5M KZT to USD

      // Check construction tender
      const constructionTender = tenders.find(t => t.externalId === '789012');
      expect(constructionTender!.category).toBe('CONSTRUCTION');
      expect(Number(constructionTender!.estimatedValue)).toBeCloseTo(100000, 0); // ~50M KZT to USD
    });

    it('should handle duplicate detection', async () => {
      // First import
      const result1 = await transformerService.processScrapedData(
        mockCsvPath,
        tenantId,
        userId
      );
      expect(result1.imported).toBe(3);

      // Second import (should detect duplicates)
      const result2 = await transformerService.processScrapedData(
        mockCsvPath,
        tenantId,
        userId
      );
      expect(result2.imported).toBe(0);
      expect(result2.skipped).toBe(3);

      // Verify total count didn't change
      const tenderCount = await prisma.tender.count({ where: { tenantId } });
      expect(tenderCount).toBe(3);
    });

    it('should handle currency conversion properly', async () => {
      await transformerService.processScrapedData(mockCsvPath, tenantId, userId);
      
      const tenders = await prisma.tender.findMany({
        where: { tenantId }
      });

      for (const tender of tenders) {
        expect(tender.currency).toBe('USD');
        expect(tender.exchangeRates).toBeDefined();
        
        const exchangeInfo = tender.exchangeRates as any;
        expect(exchangeInfo.from).toBe('KZT');
        expect(exchangeInfo.to).toBe('USD');
        expect(exchangeInfo.rate).toBeGreaterThan(0);
        expect(exchangeInfo.originalAmount).toBeGreaterThan(0);
      }
    });
  });

  describe('Scraper Service Integration', () => {
    it('should start and track scraping job', async () => {
      const jobId = await scraperService.startScraping(tenantId, userId, {
        workers: 1,
        headless: true,
        sourcePortal: 'zakup.sk.kz'
      });

      expect(jobId).toBeDefined();
      expect(jobId).toMatch(/^scraping_\d+_[a-z0-9]+$/);

      // Check job status
      const job = scraperService.getJobStatus(jobId);
      expect(job).toBeDefined();
      expect(job!.status).toBe('queued');
      expect(job!.options.sourcePortal).toBe('zakup.sk.kz');
    });

    it('should create scraping log entry', async () => {
      const jobId = await scraperService.startScraping(tenantId, userId, {
        workers: 2,
        minValue: 1000000
      });

      // Give it a moment to create the log
      await new Promise(resolve => setTimeout(resolve, 100));

      const scrapingLog = await prisma.scrapingLog.findFirst({
        where: { 
          tenantId,
          metadata: {
            path: ['jobId'],
            equals: jobId
          }
        }
      });

      expect(scrapingLog).toBeDefined();
      expect(scrapingLog!.status).toBe('PENDING');
      expect(scrapingLog!.triggeredBy).toBe(userId);
      
      const metadata = scrapingLog!.metadata as any;
      expect(metadata.options.workers).toBe(2);
      expect(metadata.options.minValue).toBe(1000000);
    });

    it('should handle job cancellation', async () => {
      const jobId = await scraperService.startScraping(tenantId, userId);
      
      const cancelled = await scraperService.cancelJob(jobId);
      expect(cancelled).toBe(true);

      const job = scraperService.getJobStatus(jobId);
      expect(job!.status).toBe('failed');
      expect(job!.errorMessage).toBe('Cancelled by user');
    });

    it('should return scraping statistics', async () => {
      // Create some scraping logs
      await prisma.scrapingLog.createMany({
        data: [
          {
            tenantId,
            sourcePortal: 'zakup.sk.kz',
            status: 'COMPLETED',
            triggeredBy: userId,
            tendersFound: 10,
            tendersImported: 8,
            tendersUpdated: 2,
            metadata: {}
          },
          {
            tenantId,
            sourcePortal: 'zakup.sk.kz',
            status: 'FAILED',
            triggeredBy: userId,
            errorMessage: 'Test error',
            metadata: {}
          }
        ]
      });

      const stats = await scraperService.getScrapingStats(tenantId);
      
      expect(stats.statusBreakdown).toBeDefined();
      expect(stats.recentActivity).toBeDefined();
      expect(stats.totalJobs).toBe(2);
    });
  });

  describe('WebSocket Integration', () => {
    it('should emit progress events', (done) => {
      const jobId = 'test-job-123';
      
      scraperService.on('progress', (receivedJobId: string, progress: any) => {
        if (receivedJobId === jobId) {
          expect(progress.status).toBe('running');
          expect(progress.message).toBe('Test progress message');
          done();
        }
      });

      scraperService.emit('progress', jobId, {
        status: 'running',
        message: 'Test progress message'
      });
    });

    it('should emit completion events', (done) => {
      const jobId = 'test-job-456';
      
      scraperService.on('completed', (receivedJobId: string, result: any) => {
        if (receivedJobId === jobId) {
          expect(result.tendersFound).toBe(5);
          expect(result.tendersImported).toBe(3);
          done();
        }
      });

      scraperService.emit('completed', jobId, {
        tendersFound: 5,
        tendersImported: 3
      });
    });
  });

  describe('API Endpoints', () => {
    it('should start scraping via API', async () => {
      const response = await testServer.inject({
        method: 'POST',
        url: '/api/scraper/run',
        headers: {
          'authorization': 'Bearer test-token' // Mock auth
        },
        payload: {
          workers: 2,
          headless: true,
          sourcePortal: 'zakup.sk.kz'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.message).toBe('Scraping job started successfully');
    });

    it('should process CSV data via API', async () => {
      const response = await testServer.inject({
        method: 'POST',
        url: '/api/scraper/process',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: {
          csvFilePath: mockCsvPath
        }
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.imported).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should return scraper health status', async () => {
      const response = await testServer.inject({
        method: 'GET',
        url: '/api/scraper/health'
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.status).toBe('healthy');
      expect(result.scraperPath).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed CSV data', async () => {
      const badCsvPath = join(process.cwd(), 'bad-test-data.csv');
      writeFileSync(badCsvPath, 'invalid,csv,data\nwithout,proper,headers');

      try {
        await expect(
          transformerService.processScrapedData(badCsvPath, tenantId, userId)
        ).rejects.toThrow();
      } finally {
        unlinkSync(badCsvPath);
      }
    });

    it('should handle non-existent CSV file', async () => {
      await expect(
        transformerService.processScrapedData('/non/existent/file.csv', tenantId, userId)
      ).rejects.toThrow();
    });

    it('should handle invalid job cancellation', async () => {
      const cancelled = await scraperService.cancelJob('non-existent-job');
      expect(cancelled).toBe(false);
    });
  });
});