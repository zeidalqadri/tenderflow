import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { 
  scheduleReceiptParse, 
  scheduleAlertDispatch,
  getJobStatus,
  metricsCollector 
} from '../index';
import { receiptParseQueue, alertDispatchQueue } from '../queues';
import { mockPrisma } from './setup';

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Setup test environment
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

  afterAll(async () => {
    // Cleanup
    await receiptParseQueue.close();
    await alertDispatchQueue.close();
  });

  describe('Job Scheduling', () => {
    it('should schedule receipt parsing job', async () => {
      const jobId = await scheduleReceiptParse({
        submissionId: 'sub-123',
        receiptKey: 'receipts/test.pdf',
        tenantId: 'tenant-123',
        userId: 'user-123',
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });

    it('should schedule alert dispatch job with priority', async () => {
      const jobId = await scheduleAlertDispatch({
        type: 'email',
        recipients: ['test@example.com'],
        subject: 'Test Alert',
        message: 'Integration test alert',
        priority: 'urgent',
        data: { tenderId: 'tender-123' },
      });

      expect(jobId).toBeDefined();
    });

    it('should get job status', async () => {
      const jobId = await scheduleReceiptParse({
        submissionId: 'sub-123',
        receiptKey: 'receipts/test.pdf',
        tenantId: 'tenant-123',
        userId: 'user-123',
      });

      const status = await getJobStatus('receipt-parse', jobId);
      expect(status).toBeDefined();
      expect(status?.id).toBe(jobId);
    });
  });

  describe('Metrics Collection', () => {
    it('should record job metrics', () => {
      metricsCollector.recordJobCompletion('receipt-parse', 5000, true);
      metricsCollector.recordJobCompletion('receipt-parse', 3000, false);

      const metrics = metricsCollector.getMetrics('job_receipt-parse');
      expect(metrics.totalJobs).toBe(2);
      expect(metrics.completedJobs).toBe(1);
      expect(metrics.failedJobs).toBe(1);
      expect(metrics.successRate).toBe(0.5);
    });

    it('should record extractor metrics', () => {
      metricsCollector.recordExtractorUsage('zakup-sk-kz', 0.85, 2000, true);
      metricsCollector.recordExtractorUsage('zakup-sk-kz', 0.75, 1500, true);
      metricsCollector.recordExtractorUsage('zakup-sk-kz', 0, 1000, false);

      const metrics = metricsCollector.getExtractorMetrics('zakup-sk-kz');
      expect(metrics).toBeDefined();
      expect(metrics!.totalExtractions).toBe(3);
      expect(metrics!.successfulExtractions).toBe(2);
      expect(metrics!.avgConfidence).toBe(0.8); // (0.85 + 0.75) / 2
      expect(metrics!.errorRate).toBeCloseTo(0.33, 1);
    });

    it('should get system health', async () => {
      const health = await metricsCollector.getSystemHealth();
      
      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.services).toBeDefined();
      expect(health.queues).toBeDefined();
      expect(health.resources).toBeDefined();
      expect(typeof health.uptime).toBe('number');
    });

    it('should export Prometheus metrics', () => {
      metricsCollector.recordJobCompletion('test-queue', 1000, true);
      
      const prometheus = metricsCollector.exportPrometheusMetrics();
      expect(prometheus).toContain('tenderflow_jobs_total');
      expect(prometheus).toContain('queue="test-queue"');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid queue name in job status', async () => {
      await expect(getJobStatus('invalid-queue', 'job-123'))
        .rejects.toThrow('Unknown queue: invalid-queue');
    });

    it('should return null for non-existent job', async () => {
      const status = await getJobStatus('receipt-parse', 'non-existent-job');
      expect(status).toBeNull();
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent job scheduling', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(scheduleReceiptParse({
          submissionId: `sub-${i}`,
          receiptKey: `receipts/test-${i}.pdf`,
          tenantId: 'tenant-123',
          userId: 'user-123',
        }));
      }

      const jobIds = await Promise.all(promises);
      expect(jobIds).toHaveLength(10);
      expect(jobIds.every(id => typeof id === 'string')).toBe(true);
    });

    it('should maintain metrics accuracy under load', () => {
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const success = i % 3 !== 0; // ~67% success rate
        metricsCollector.recordJobCompletion('load-test', 1000 + i, success);
      }

      const metrics = metricsCollector.getMetrics('job_load-test');
      expect(metrics.totalJobs).toBe(iterations);
      expect(metrics.successRate).toBeCloseTo(0.67, 1);
    });
  });

  describe('Configuration Tests', () => {
    it('should have all required queues configured', () => {
      const { QUEUE_NAMES } = require('../queues');
      
      expect(QUEUE_NAMES.RECEIPT_PARSE).toBe('receipt-parse');
      expect(QUEUE_NAMES.FILE_PROCESS).toBe('file-process');
      expect(QUEUE_NAMES.ALERT_DISPATCH).toBe('alert-dispatch');
      expect(QUEUE_NAMES.RULES_APPLICATION).toBe('rules-application');
      expect(QUEUE_NAMES.OCR_PROCESS).toBe('ocr-process');
    });

    it('should have all extractors registered', () => {
      const { extractorRegistry } = require('../extractors');
      
      const capabilities = extractorRegistry.getCapabilities();
      const extractorTypes = capabilities.map((c: any) => c.type);
      
      expect(extractorTypes).toContain('zakup-sk-kz');
      expect(extractorTypes).toContain('eu-ted');
      expect(extractorTypes).toContain('generic-email');
      expect(extractorTypes).toContain('pdf-invoice');
    });
  });
});