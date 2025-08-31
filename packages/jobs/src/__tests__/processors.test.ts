import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Job } from 'bullmq';
import { processReceiptParse } from '../processors/receipt-parse';
import { processFile } from '../processors/file-process';
import { processAlertDispatch } from '../processors/alert-dispatch';
import { processRulesApplication } from '../processors/rules-application';
import { mockPrisma } from './setup';
import type { ReceiptParseJobData, FileProcessJobData, AlertDispatchJobData, RulesApplicationJobData } from '../queues';

// Mock job interface
const createMockJob = <T>(data: T): Job<T> => ({
  data,
  id: 'mock-job-id',
  name: 'mock-job',
  log: jest.fn(),
  updateProgress: jest.fn(),
  timestamp: Date.now(),
  finishedOn: undefined,
  failedReason: undefined,
  returnvalue: undefined,
  progress: 0,
} as any);

describe('Job Processors', () => {
  describe('Receipt Parse Processor', () => {
    beforeEach(() => {
      mockPrisma.submission.findUnique.mockResolvedValue({
        id: 'sub-123',
        receiptKey: 'receipts/test.pdf',
        tender: {
          id: 'tender-123',
          title: 'Test Tender',
          tenantId: 'tenant-123',
        },
      });

      mockPrisma.submission.update.mockResolvedValue({
        id: 'sub-123',
      });
    });

    it('should process receipt parsing successfully', async () => {
      const jobData: ReceiptParseJobData = {
        submissionId: 'sub-123',
        receiptKey: 'receipts/test.pdf',
        tenantId: 'tenant-123',
        userId: 'user-123',
        metadata: {
          originalName: 'test_receipt.pdf',
        },
      };

      const job = createMockJob(jobData);
      const result = await processReceiptParse(job);

      expect(result.success).toBe(true);
      expect(result.ocrText).toBe('Mock OCR text content for testing');
      expect(result.processingTime).toBeGreaterThan(0);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
      expect(mockPrisma.submission.update).toHaveBeenCalled();
    });

    it('should handle submission not found', async () => {
      mockPrisma.submission.findUnique.mockResolvedValue(null);

      const jobData: ReceiptParseJobData = {
        submissionId: 'non-existent',
        receiptKey: 'receipts/test.pdf',
        tenantId: 'tenant-123',
        userId: 'user-123',
      };

      const job = createMockJob(jobData);
      
      await expect(processReceiptParse(job)).rejects.toThrow('Submission non-existent not found');
    });

    it('should handle tenant mismatch', async () => {
      mockPrisma.submission.findUnique.mockResolvedValue({
        id: 'sub-123',
        tender: {
          tenantId: 'wrong-tenant',
        },
      });

      const jobData: ReceiptParseJobData = {
        submissionId: 'sub-123',
        receiptKey: 'receipts/test.pdf',
        tenantId: 'tenant-123',
        userId: 'user-123',
      };

      const job = createMockJob(jobData);
      
      await expect(processReceiptParse(job)).rejects.toThrow('does not belong to tenant');
    });

    it('should return fallback result when no extractors found', async () => {
      const jobData: ReceiptParseJobData = {
        submissionId: 'sub-123',
        receiptKey: 'receipts/unknown.xyz',
        tenantId: 'tenant-123',
        userId: 'user-123',
        metadata: {
          originalName: 'unknown_file.xyz',
        },
      };

      const job = createMockJob(jobData);
      const result = await processReceiptParse(job);

      expect(result.success).toBe(true);
      expect(result.ocrText).toBe('Mock OCR text content for testing');
      expect(result.parsed?.metadata?.ocrOnly).toBe(true);
    });
  });

  describe('File Process Processor', () => {
    it('should process file successfully', async () => {
      const jobData: FileProcessJobData = {
        fileKey: 'files/test.jpg',
        bucket: 'test-bucket',
        originalName: 'test_image.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        uploadedBy: 'user-123',
        tenantId: 'tenant-123',
      };

      const job = createMockJob(jobData);
      const result = await processFile(job);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should handle file not found', async () => {
      // Mock file not existing
      const mockFileStorageService = await import('../services/file-storage');
      jest.spyOn(mockFileStorageService.fileStorageService, 'fileExists').mockResolvedValue(false);

      const jobData: FileProcessJobData = {
        fileKey: 'files/nonexistent.jpg',
        bucket: 'test-bucket',
        originalName: 'nonexistent.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        uploadedBy: 'user-123',
        tenantId: 'tenant-123',
      };

      const job = createMockJob(jobData);
      const result = await processFile(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });
  });

  describe('Alert Dispatch Processor', () => {
    it('should dispatch email alert successfully', async () => {
      const jobData: AlertDispatchJobData = {
        type: 'email',
        recipients: ['test@example.com'],
        subject: 'Test Alert',
        message: 'This is a test alert',
        data: { tenderId: 'tender-123' },
      };

      const job = createMockJob(jobData);
      const result = await processAlertDispatch(job);

      expect(result.success).toBe(true);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should dispatch webhook alert successfully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const jobData: AlertDispatchJobData = {
        type: 'webhook',
        recipients: ['https://example.com/webhook'],
        message: 'Test webhook alert',
        data: { tenderId: 'tender-123' },
      };

      const job = createMockJob(jobData);
      const result = await processAlertDispatch(job);

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle webhook failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const jobData: AlertDispatchJobData = {
        type: 'webhook',
        recipients: ['https://example.com/webhook'],
        message: 'Test webhook alert',
        data: {},
      };

      const job = createMockJob(jobData);
      const result = await processAlertDispatch(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should handle unknown alert type', async () => {
      const jobData: AlertDispatchJobData = {
        type: 'unknown' as any,
        recipients: ['test@example.com'],
        message: 'Test alert',
        data: {},
      };

      const job = createMockJob(jobData);
      const result = await processAlertDispatch(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown alert type');
    });
  });

  describe('Rules Application Processor', () => {
    beforeEach(() => {
      mockPrisma.tender.findUnique.mockResolvedValue({
        id: 'tender-123',
        title: 'Software Development Services',
        description: 'Development of custom software application',
        category: 'OTHER',
        estimatedValue: 50000,
        status: 'SCRAPED',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        submissions: [],
        documents: [
          { type: 'RFP' },
          { type: 'TECHNICAL_SPEC' },
        ],
        validations: [],
      });

      mockPrisma.tender.update.mockResolvedValue({
        id: 'tender-123',
        category: 'IT_SERVICES',
      });

      mockPrisma.tenderValidation.upsert.mockResolvedValue({
        id: 'validation-123',
      });

      mockPrisma.stateTransition.create.mockResolvedValue({
        id: 'transition-123',
      });
    });

    it('should apply categorization rules', async () => {
      const jobData: RulesApplicationJobData = {
        tenderId: 'tender-123',
        context: {},
      };

      const job = createMockJob(jobData);
      const result = await processRulesApplication(job);

      expect(result.success).toBe(true);
      expect(result.appliedRules).toContain('categorization:keyword:IT_SERVICES');
      expect(mockPrisma.tender.update).toHaveBeenCalledWith({
        where: { id: 'tender-123' },
        data: { category: 'IT_SERVICES' },
      });
    });

    it('should apply validation rules', async () => {
      const jobData: RulesApplicationJobData = {
        tenderId: 'tender-123',
        context: {},
      };

      const job = createMockJob(jobData);
      const result = await processRulesApplication(job);

      expect(result.success).toBe(true);
      expect(result.appliedRules).toContain('validation:score:90');
      expect(mockPrisma.tenderValidation.upsert).toHaveBeenCalled();
    });

    it('should handle tender not found', async () => {
      mockPrisma.tender.findUnique.mockResolvedValue(null);

      const jobData: RulesApplicationJobData = {
        tenderId: 'non-existent',
        context: {},
      };

      const job = createMockJob(jobData);
      const result = await processRulesApplication(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tender non-existent not found');
    });

    it('should apply status transition rules', async () => {
      mockPrisma.tender.findUnique.mockResolvedValue({
        id: 'tender-123',
        title: 'Test Tender',
        description: 'Test Description',
        category: 'IT_SERVICES',
        status: 'VALIDATED',
        submissions: [{ id: 'sub-1' }], // Has submissions
        documents: [{ type: 'RFP' }],
        validations: [{ isValid: true }],
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      });

      const jobData: RulesApplicationJobData = {
        tenderId: 'tender-123',
        context: {},
      };

      const job = createMockJob(jobData);
      const result = await processRulesApplication(job);

      expect(result.success).toBe(true);
      expect(result.appliedRules).toContain('status:validated_to_qualified');
      expect(mockPrisma.stateTransition.create).toHaveBeenCalled();
    });
  });
});