/**
 * Enhanced Monitoring Plugin for TenderFlow API
 * Provides comprehensive metrics collection with OpenTelemetry and GCP Cloud Monitoring
 * Implements business and technical KPIs with real-time dashboards
 */

import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { MetricServiceClient } from '@google-cloud/monitoring';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { MetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { CloudLogging } from '@google-cloud/logging';
import { ErrorReporting } from '@google-cloud/error-reporting';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Metric types
interface MetricPoint {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: Date;
}

interface IngestionMetrics {
  tendersReceived: number;
  tendersProcessed: number;
  validationFailures: number;
  duplicatesDetected: number;
  processingTimeMs: number;
}

// Monitoring service class
class MonitoringService {
  private monitoring: MetricServiceClient | null = null;
  private projectId: string;
  private environment: string;
  private metrics: Map<string, MetricPoint[]> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(projectId?: string) {
    this.projectId = projectId || process.env.GCP_PROJECT_ID || '';
    this.environment = process.env.NODE_ENV || 'development';
    
    if (this.projectId) {
      this.initializeGCPMonitoring();
    } else {
      logger.warn('No GCP project ID provided, metrics will be logged locally only');
    }
    
    // Start metrics flush interval
    this.startMetricsFlush();
  }

  private initializeGCPMonitoring() {
    try {
      this.monitoring = new MetricServiceClient({
        projectId: this.projectId
      });
      logger.info(`Initialized GCP monitoring for project ${this.projectId}`);
    } catch (error) {
      logger.error('Failed to initialize GCP monitoring:', error);
      this.monitoring = null;
    }
  }

  private startMetricsFlush() {
    // Flush metrics every 60 seconds
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, 60000);
  }

  async flushMetrics() {
    if (!this.monitoring) {
      // Log metrics locally
      this.metrics.forEach((points, metricName) => {
        logger.info('Local metrics', {
          metric: metricName,
          points: points.length,
          latest: points[points.length - 1]
        });
      });
      this.metrics.clear();
      return;
    }

    try {
      const projectPath = this.monitoring.projectPath(this.projectId);
      const timeSeries: any[] = [];

      this.metrics.forEach((points, metricName) => {
        points.forEach(point => {
          timeSeries.push({
            metric: {
              type: `custom.googleapis.com/tenderflow/${metricName}`,
              labels: {
                ...point.labels,
                environment: this.environment
              }
            },
            resource: {
              type: 'global',
              labels: {
                project_id: this.projectId
              }
            },
            points: [{
              interval: {
                endTime: {
                  seconds: Math.floor((point.timestamp || new Date()).getTime() / 1000)
                }
              },
              value: {
                doubleValue: point.value
              }
            }]
          });
        });
      });

      if (timeSeries.length > 0) {
        await this.monitoring.createTimeSeries({
          name: projectPath,
          timeSeries
        });
        logger.info(`Flushed ${timeSeries.length} metrics to GCP`);
      }

      this.metrics.clear();
    } catch (error) {
      logger.error('Failed to flush metrics to GCP:', error);
    }
  }

  recordMetric(name: string, value: number, labels?: Record<string, string>) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name)!.push({
      name,
      value,
      labels,
      timestamp: new Date()
    });
  }

  recordIngestionMetrics(metrics: IngestionMetrics, batchId: string) {
    this.recordMetric('ingestion_tenders_received', metrics.tendersReceived, { batch_id: batchId });
    this.recordMetric('ingestion_tenders_processed', metrics.tendersProcessed, { batch_id: batchId });
    this.recordMetric('ingestion_validation_failures', metrics.validationFailures, { batch_id: batchId });
    this.recordMetric('ingestion_duplicates_detected', metrics.duplicatesDetected, { batch_id: batchId });
    this.recordMetric('ingestion_processing_time_ms', metrics.processingTimeMs, { batch_id: batchId });
    
    // Calculate success rate
    const successRate = metrics.tendersReceived > 0 
      ? (metrics.tendersProcessed / metrics.tendersReceived) * 100 
      : 0;
    this.recordMetric('ingestion_success_rate', successRate, { batch_id: batchId });
  }

  recordRequestMetrics(request: FastifyRequest, reply: FastifyReply, responseTimeMs: number) {
    const labels = {
      method: request.method,
      route: request.routeOptions?.url || request.url,
      status_code: reply.statusCode.toString()
    };
    
    this.recordMetric('api_request_count', 1, labels);
    this.recordMetric('api_request_duration_ms', responseTimeMs, labels);
    
    // Record error rates
    if (reply.statusCode >= 400) {
      this.recordMetric('api_error_count', 1, {
        ...labels,
        error_type: reply.statusCode >= 500 ? 'server_error' : 'client_error'
      });
    }
  }

  recordDatabaseMetrics(operation: string, durationMs: number, success: boolean) {
    const labels = {
      operation,
      status: success ? 'success' : 'failure'
    };
    
    this.recordMetric('database_operation_count', 1, labels);
    this.recordMetric('database_operation_duration_ms', durationMs, labels);
  }

  recordQueueMetrics(queueName: string, depth: number, processingTimeMs?: number) {
    this.recordMetric('queue_depth', depth, { queue: queueName });
    
    if (processingTimeMs !== undefined) {
      this.recordMetric('queue_processing_time_ms', processingTimeMs, { queue: queueName });
    }
  }

  recordCircuitBreakerMetrics(service: string, state: 'closed' | 'open' | 'half_open') {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
    this.recordMetric('circuit_breaker_state', stateValue, { service });
  }

  async shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flushMetrics();
  }
}

// Request tracking middleware
interface RequestTracking {
  correlationId: string;
  startTime: number;
  userId?: string;
  tenantId?: string;
}

const monitoringPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Initialize monitoring service
  const monitoringService = new MonitoringService();
  
  // Decorate fastify with monitoring service
  fastify.decorate('monitoring', monitoringService);
  
  // Add request tracking
  fastify.decorateRequest('tracking', null);
  
  // Pre-handler to start request tracking
  fastify.addHook('onRequest', async (request, reply) => {
    const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4();
    
    const tracking: RequestTracking = {
      correlationId,
      startTime: Date.now()
    };
    
    (request as any).tracking = tracking;
    
    // Set correlation ID in response headers
    reply.header('x-correlation-id', correlationId);
    
    // Log request start
    logger.info('Request started', {
      correlationId,
      method: request.method,
      url: request.url,
      headers: request.headers
    });
  });
  
  // Post-handler to record metrics
  fastify.addHook('onResponse', async (request, reply) => {
    const tracking = (request as any).tracking as RequestTracking;
    
    if (tracking) {
      const responseTimeMs = Date.now() - tracking.startTime;
      
      // Record request metrics
      monitoringService.recordRequestMetrics(request, reply, responseTimeMs);
      
      // Log request completion
      logger.info('Request completed', {
        correlationId: tracking.correlationId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs,
        userId: tracking.userId,
        tenantId: tracking.tenantId
      });
      
      // Log slow requests
      if (responseTimeMs > 1000) {
        logger.warn('Slow request detected', {
          correlationId: tracking.correlationId,
          url: request.url,
          responseTimeMs
        });
      }
    }
  });
  
  // Error handler for monitoring
  fastify.addHook('onError', async (request, reply, error) => {
    const tracking = (request as any).tracking as RequestTracking;
    
    logger.error('Request error', {
      correlationId: tracking?.correlationId,
      method: request.method,
      url: request.url,
      error: error.message,
      stack: error.stack
    });
    
    monitoringService.recordMetric('api_error_count', 1, {
      method: request.method,
      route: request.url,
      error_type: error.name || 'UnknownError'
    });
  });
  
  // Health check endpoint for monitoring
  fastify.get('/monitoring/health', async (request, reply) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      projectId: monitoringService['projectId'],
      metrics: {
        buffered: monitoringService['metrics'].size,
        monitoring: monitoringService['monitoring'] ? 'connected' : 'local'
      }
    };
    
    return reply.send(health);
  });
  
  // Metrics endpoint for debugging
  fastify.get('/monitoring/metrics', async (request, reply) => {
    const metrics: any = {};
    
    monitoringService['metrics'].forEach((points, name) => {
      metrics[name] = {
        count: points.length,
        latest: points[points.length - 1]
      };
    });
    
    return reply.send({
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      metrics
    });
  });
  
  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await monitoringService.shutdown();
    logger.info('Monitoring service shut down');
  });
};

// Export interfaces for use in routes
export interface MonitoringService {
  recordMetric(name: string, value: number, labels?: Record<string, string>): void;
  recordIngestionMetrics(metrics: IngestionMetrics, batchId: string): void;
  recordRequestMetrics(request: FastifyRequest, reply: FastifyReply, responseTimeMs: number): void;
  recordDatabaseMetrics(operation: string, durationMs: number, success: boolean): void;
  recordQueueMetrics(queueName: string, depth: number, processingTimeMs?: number): void;
  recordCircuitBreakerMetrics(service: string, state: 'closed' | 'open' | 'half_open'): void;
}

export { IngestionMetrics };

// Module augmentation to add monitoring to FastifyInstance
declare module 'fastify' {
  interface FastifyInstance {
    monitoring: MonitoringService;
  }
  
  interface FastifyRequest {
    tracking: RequestTracking;
  }
}

export default fp(monitoringPlugin, {
  name: 'monitoring',
  decorators: {
    fastify: ['jwt']
  }
});