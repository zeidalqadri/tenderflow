/**
 * Metrics and monitoring service for TenderFlow job processing
 */

export interface JobMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  waitingJobs: number;
  avgProcessingTime: number;
  successRate: number;
  throughput: number; // jobs per minute
}

export interface ExtractorMetrics {
  extractorType: string;
  totalExtractions: number;
  successfulExtractions: number;
  avgConfidence: number;
  avgProcessingTime: number;
  errorRate: number;
  lastUsed: Date;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    redis: { status: string; latency?: number };
    minio: { status: string; available: boolean };
    ocr: { status: string; workersActive: number };
    database: { status: string; connectionPool: number };
  };
  queues: Record<string, {
    status: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    paused: boolean;
  }>;
  resources: {
    memory: { used: number; total: number; percentage: number };
    cpu: { usage: number };
    disk: { used: number; total: number; percentage: number };
  };
  uptime: number;
}

export class MetricsCollector {
  private metrics: Map<string, any> = new Map();
  private collectors: Map<string, () => Promise<any>> = new Map();
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.setupMetricsCollection();
  }

  /**
   * Start metrics collection
   */
  start(intervalMs: number = 60000): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      await this.collectAllMetrics();
    }, intervalMs);

    console.log(`Metrics collection started with ${intervalMs}ms interval`);
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Register a custom metric collector
   */
  registerCollector(name: string, collector: () => Promise<any>): void {
    this.collectors.set(name, collector);
  }

  /**
   * Get current metrics
   */
  getMetrics(name?: string): any {
    if (name) {
      return this.metrics.get(name);
    }
    return Object.fromEntries(this.metrics.entries());
  }

  /**
   * Record job completion
   */
  recordJobCompletion(queueName: string, processingTime: number, success: boolean): void {
    const key = `job_${queueName}`;
    const existing = this.metrics.get(key) || {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalProcessingTime: 0,
      processingTimes: [],
    };

    existing.totalJobs++;
    if (success) {
      existing.completedJobs++;
    } else {
      existing.failedJobs++;
    }
    
    existing.totalProcessingTime += processingTime;
    existing.processingTimes.push({
      time: processingTime,
      timestamp: Date.now(),
    });

    // Keep only last 100 processing times for average calculation
    if (existing.processingTimes.length > 100) {
      existing.processingTimes = existing.processingTimes.slice(-100);
    }

    existing.avgProcessingTime = existing.totalProcessingTime / existing.totalJobs;
    existing.successRate = existing.completedJobs / existing.totalJobs;

    this.metrics.set(key, existing);
  }

  /**
   * Record extractor usage
   */
  recordExtractorUsage(
    extractorType: string, 
    confidence: number, 
    processingTime: number, 
    success: boolean
  ): void {
    const key = `extractor_${extractorType}`;
    const existing = this.metrics.get(key) || {
      totalExtractions: 0,
      successfulExtractions: 0,
      totalConfidence: 0,
      totalProcessingTime: 0,
      errors: 0,
      lastUsed: new Date(),
    };

    existing.totalExtractions++;
    existing.lastUsed = new Date();
    existing.totalProcessingTime += processingTime;

    if (success) {
      existing.successfulExtractions++;
      existing.totalConfidence += confidence;
    } else {
      existing.errors++;
    }

    existing.avgConfidence = existing.totalConfidence / existing.successfulExtractions || 0;
    existing.avgProcessingTime = existing.totalProcessingTime / existing.totalExtractions;
    existing.errorRate = existing.errors / existing.totalExtractions;

    this.metrics.set(key, existing);
  }

  /**
   * Get job metrics for a specific queue
   */
  async getJobMetrics(queueName: string): Promise<JobMetrics> {
    const { queues } = await import('../queues');
    const queue = queues[queueName as keyof typeof queues];
    
    if (!queue) {
      throw new Error(`Unknown queue: ${queueName}`);
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(), 
      queue.getCompleted(),
      queue.getFailed(),
    ]);

    const stored = this.metrics.get(`job_${queueName}`) || {};
    
    // Calculate throughput (jobs per minute) from recent completions
    const recentCompletions = stored.processingTimes?.filter(
      (pt: any) => Date.now() - pt.timestamp < 60000
    ) || [];

    return {
      totalJobs: stored.totalJobs || 0,
      completedJobs: completed.length,
      failedJobs: failed.length,
      activeJobs: active.length,
      waitingJobs: waiting.length,
      avgProcessingTime: stored.avgProcessingTime || 0,
      successRate: stored.successRate || 0,
      throughput: recentCompletions.length,
    };
  }

  /**
   * Get extractor metrics
   */
  getExtractorMetrics(extractorType: string): ExtractorMetrics | null {
    const stored = this.metrics.get(`extractor_${extractorType}`);
    if (!stored) return null;

    return {
      extractorType,
      totalExtractions: stored.totalExtractions,
      successfulExtractions: stored.successfulExtractions,
      avgConfidence: stored.avgConfidence,
      avgProcessingTime: stored.avgProcessingTime,
      errorRate: stored.errorRate,
      lastUsed: stored.lastUsed,
    };
  }

  /**
   * Get all extractor metrics
   */
  getAllExtractorMetrics(): ExtractorMetrics[] {
    const extractorMetrics: ExtractorMetrics[] = [];
    
    for (const [key, value] of this.metrics.entries()) {
      if (key.startsWith('extractor_')) {
        const extractorType = key.replace('extractor_', '');
        extractorMetrics.push({
          extractorType,
          totalExtractions: value.totalExtractions,
          successfulExtractions: value.successfulExtractions,
          avgConfidence: value.avgConfidence,
          avgProcessingTime: value.avgProcessingTime,
          errorRate: value.errorRate,
          lastUsed: value.lastUsed,
        });
      }
    }

    return extractorMetrics;
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const health: SystemHealth = {
      status: 'healthy',
      services: {
        redis: { status: 'unknown' },
        minio: { status: 'unknown', available: false },
        ocr: { status: 'unknown', workersActive: 0 },
        database: { status: 'unknown', connectionPool: 0 },
      },
      queues: {},
      resources: {
        memory: { used: 0, total: 0, percentage: 0 },
        cpu: { usage: 0 },
        disk: { used: 0, total: 0, percentage: 0 },
      },
      uptime: process.uptime(),
    };

    // Check Redis health
    try {
      const { getQueueHealth } = await import('../queues');
      const queueHealth = await getQueueHealth();
      
      health.services.redis.status = 'healthy';
      health.queues = queueHealth;
      
      // Check if any queues are unhealthy
      const hasUnhealthyQueues = Object.values(queueHealth).some(
        (q: any) => q.status === 'unhealthy'
      );
      if (hasUnhealthyQueues) {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.redis.status = 'unhealthy';
      health.status = 'unhealthy';
    }

    // Check MinIO health
    try {
      const { fileStorageService } = await import('./file-storage');
      const minioHealth = await fileStorageService.getHealth();
      health.services.minio = {
        status: minioHealth.status,
        available: minioHealth.status === 'healthy',
      };
      
      if (minioHealth.status !== 'healthy') {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.minio.status = 'unhealthy';
      health.status = 'unhealthy';
    }

    // Check OCR service health
    try {
      const { ocrService } = await import('./ocr');
      const workerStatus = ocrService.getWorkerStatus();
      health.services.ocr = {
        status: Object.keys(workerStatus).length > 0 ? 'healthy' : 'degraded',
        workersActive: Object.keys(workerStatus).length,
      };
    } catch (error) {
      health.services.ocr.status = 'unhealthy';
      health.status = 'unhealthy';
    }

    // Get system resources
    const memUsage = process.memoryUsage();
    health.resources.memory = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
    };

    // CPU usage would require a more complex implementation
    health.resources.cpu.usage = 0; // Placeholder

    return health;
  }

  /**
   * Setup default metrics collectors
   */
  private setupMetricsCollection(): void {
    // System metrics collector
    this.registerCollector('system', async () => {
      return {
        timestamp: Date.now(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      };
    });

    // Queue metrics collector
    this.registerCollector('queues', async () => {
      try {
        const { getQueueHealth } = await import('../queues');
        return await getQueueHealth();
      } catch (error) {
        return { error: 'Failed to collect queue metrics' };
      }
    });
  }

  /**
   * Collect all registered metrics
   */
  private async collectAllMetrics(): void {
    for (const [name, collector] of this.collectors.entries()) {
      try {
        const data = await collector();
        this.metrics.set(`collected_${name}`, {
          ...data,
          collectedAt: Date.now(),
        });
      } catch (error) {
        console.error(`Failed to collect metrics for ${name}:`, error);
        this.metrics.set(`collected_${name}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          collectedAt: Date.now(),
        });
      }
    }
  }

  /**
   * Export metrics in Prometheus format (basic implementation)
   */
  exportPrometheusMetrics(): string {
    let output = '';
    
    // Job metrics
    for (const [key, value] of this.metrics.entries()) {
      if (key.startsWith('job_')) {
        const queueName = key.replace('job_', '');
        output += `# HELP tenderflow_jobs_total Total number of jobs processed\n`;
        output += `# TYPE tenderflow_jobs_total counter\n`;
        output += `tenderflow_jobs_total{queue="${queueName}"} ${value.totalJobs || 0}\n\n`;
        
        output += `# HELP tenderflow_jobs_completed Total number of completed jobs\n`;
        output += `# TYPE tenderflow_jobs_completed counter\n`;
        output += `tenderflow_jobs_completed{queue="${queueName}"} ${value.completedJobs || 0}\n\n`;
        
        output += `# HELP tenderflow_jobs_failed Total number of failed jobs\n`;
        output += `# TYPE tenderflow_jobs_failed counter\n`;
        output += `tenderflow_jobs_failed{queue="${queueName}"} ${value.failedJobs || 0}\n\n`;
        
        output += `# HELP tenderflow_job_processing_time_avg Average job processing time in milliseconds\n`;
        output += `# TYPE tenderflow_job_processing_time_avg gauge\n`;
        output += `tenderflow_job_processing_time_avg{queue="${queueName}"} ${value.avgProcessingTime || 0}\n\n`;
      }
    }

    // Extractor metrics
    for (const [key, value] of this.metrics.entries()) {
      if (key.startsWith('extractor_')) {
        const extractorType = key.replace('extractor_', '');
        output += `# HELP tenderflow_extractions_total Total number of extractions\n`;
        output += `# TYPE tenderflow_extractions_total counter\n`;
        output += `tenderflow_extractions_total{extractor="${extractorType}"} ${value.totalExtractions || 0}\n\n`;
        
        output += `# HELP tenderflow_extraction_confidence_avg Average extraction confidence\n`;
        output += `# TYPE tenderflow_extraction_confidence_avg gauge\n`;
        output += `tenderflow_extraction_confidence_avg{extractor="${extractorType}"} ${value.avgConfidence || 0}\n\n`;
      }
    }

    return output;
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();

// Start metrics collection if in production
if (process.env.NODE_ENV === 'production') {
  metricsCollector.start(60000); // Collect every minute
}

// Graceful shutdown
process.on('SIGTERM', () => {
  metricsCollector.stop();
});

process.on('SIGINT', () => {
  metricsCollector.stop();
});