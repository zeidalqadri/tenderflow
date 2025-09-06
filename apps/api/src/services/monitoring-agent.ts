/**
 * Monitoring Agent Service
 * Collects system metrics and component health status
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as process from 'process';
import { prisma } from '../database/client';
import { CacheManager } from './redis';
import { logger } from '../utils/logger';
import type {
  SystemHealth,
  ComponentHealth,
  SystemMetrics,
  AlertEvent,
  ErrorPattern,
  ComponentStatus,
  AlertLevel,
} from '@tenderflow/shared';

export class MonitoringAgent extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private components: Map<string, ComponentHealth> = new Map();
  private errors: Map<string, ErrorPattern> = new Map();
  private alerts: AlertEvent[] = [];
  private metrics: SystemMetrics[] = [];
  private cache: CacheManager;

  constructor() {
    super();
    this.cache = new CacheManager();
    this.initializeComponents();
  }

  private initializeComponents() {
    // Define system components
    const componentDefs = [
      { id: 'api', name: 'API Server' },
      { id: 'database', name: 'PostgreSQL Database' },
      { id: 'cache', name: 'Redis Cache' },
      { id: 'queue', name: 'Job Queue' },
      { id: 'storage', name: 'File Storage' },
      { id: 'scraper', name: 'Scraper Service' },
      { id: 'ingestion', name: 'Ingestion Pipeline' },
      { id: 'frontend', name: 'Web Application' },
    ];

    componentDefs.forEach(comp => {
      this.components.set(comp.id, {
        id: comp.id,
        name: comp.name,
        status: 'unknown',
        health: 0,
        lastCheck: new Date(),
      });
    });
  }

  /**
   * Start monitoring
   */
  start(intervalMs: number = 30000) {
    logger.info('Starting monitoring agent');
    
    // Initial check
    this.collectMetrics();
    
    // Set up interval
    this.interval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Monitoring agent stopped');
    }
  }

  /**
   * Collect all metrics
   */
  private async collectMetrics() {
    try {
      const [systemMetrics, componentHealth] = await Promise.all([
        this.collectSystemMetrics(),
        this.checkComponentHealth(),
      ]);

      const health = this.calculateOverallHealth();
      
      // Emit events
      this.emit('metrics:update', systemMetrics);
      this.emit('health:update', health);
      
      // Check for alerts
      this.checkAlerts(systemMetrics, health);
      
    } catch (error) {
      logger.error('Error collecting metrics:', error);
      this.addError('monitoring', 'Failed to collect metrics', error);
    }
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    const metrics: SystemMetrics = {
      cpu: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to percentage
      memory: ((totalMem - freeMem) / totalMem) * 100,
      disk: await this.getDiskUsage(),
      network: await this.getNetworkStats(),
      timestamp: Date.now(),
    };

    this.metrics.push(metrics);
    // Keep only last 100 metrics
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }

    return metrics;
  }

  /**
   * Check component health
   */
  private async checkComponentHealth(): Promise<Map<string, ComponentHealth>> {
    const checks = [
      this.checkAPIHealth(),
      this.checkDatabaseHealth(),
      this.checkCacheHealth(),
      this.checkQueueHealth(),
      this.checkStorageHealth(),
    ];

    await Promise.all(checks);
    
    // Emit individual component updates
    this.components.forEach(component => {
      this.emit('component:update', component);
    });

    return this.components;
  }

  /**
   * Check API health
   */
  private async checkAPIHealth() {
    const component = this.components.get('api')!;
    
    try {
      const startTime = Date.now();
      // Simple health check - verify process is responsive
      const metrics = {
        uptime: process.uptime(),
        latency: Date.now() - startTime,
        requests: 0, // Would be tracked separately
        errors: 0,   // Would be tracked separately
      };

      component.status = 'healthy';
      component.health = 100;
      component.metrics = metrics;
    } catch (error) {
      component.status = 'error';
      component.health = 0;
      this.addError('api', 'API health check failed', error);
    }
    
    component.lastCheck = new Date();
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth() {
    const component = this.components.get('database')!;
    
    try {
      const startTime = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;
      
      component.status = latency < 100 ? 'healthy' : latency < 500 ? 'warning' : 'error';
      component.health = latency < 100 ? 100 : latency < 500 ? 75 : 25;
      component.metrics = { latency };
    } catch (error) {
      component.status = 'error';
      component.health = 0;
      this.addError('database', 'Database health check failed', error);
    }
    
    component.lastCheck = new Date();
  }

  /**
   * Check cache health
   */
  private async checkCacheHealth() {
    const component = this.components.get('cache')!;
    
    try {
      const startTime = Date.now();
      await this.cache.ping();
      const latency = Date.now() - startTime;
      
      component.status = latency < 50 ? 'healthy' : latency < 200 ? 'warning' : 'error';
      component.health = latency < 50 ? 100 : latency < 200 ? 75 : 25;
      component.metrics = { latency };
    } catch (error) {
      component.status = 'error';
      component.health = 0;
      this.addError('cache', 'Cache health check failed', error);
    }
    
    component.lastCheck = new Date();
  }

  /**
   * Check queue health
   */
  private async checkQueueHealth() {
    const component = this.components.get('queue')!;
    
    try {
      // Check queue depth and processing rate
      // This would connect to BullMQ to get actual metrics
      component.status = 'healthy';
      component.health = 100;
      component.metrics = {
        throughput: 0,
        errors: 0,
      };
    } catch (error) {
      component.status = 'error';
      component.health = 0;
      this.addError('queue', 'Queue health check failed', error);
    }
    
    component.lastCheck = new Date();
  }

  /**
   * Check storage health
   */
  private async checkStorageHealth() {
    const component = this.components.get('storage')!;
    
    try {
      const diskUsage = await this.getDiskUsage();
      
      component.status = diskUsage < 70 ? 'healthy' : diskUsage < 90 ? 'warning' : 'error';
      component.health = diskUsage < 70 ? 100 : diskUsage < 90 ? 50 : 10;
      component.metrics = { disk: diskUsage };
    } catch (error) {
      component.status = 'error';
      component.health = 0;
      this.addError('storage', 'Storage health check failed', error);
    }
    
    component.lastCheck = new Date();
  }

  /**
   * Calculate overall system health
   */
  private calculateOverallHealth(): SystemHealth {
    let totalHealth = 0;
    let componentCount = 0;
    const componentHealthMap: Record<string, ComponentHealth> = {};

    this.components.forEach((component, id) => {
      totalHealth += component.health;
      componentCount++;
      componentHealthMap[id] = component;
    });

    const avgHealth = componentCount > 0 ? totalHealth / componentCount : 0;
    const overall: ComponentStatus = 
      avgHealth >= 90 ? 'healthy' :
      avgHealth >= 70 ? 'warning' :
      avgHealth >= 30 ? 'error' : 'unknown';

    return {
      overall,
      uptime: process.uptime(),
      lastCheck: new Date(),
      components: componentHealthMap,
    };
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(metrics: SystemMetrics, health: SystemHealth) {
    // Check CPU alert
    if (metrics.cpu > 80) {
      this.addAlert('warning', 'system', `High CPU usage: ${metrics.cpu.toFixed(1)}%`);
    }

    // Check memory alert
    if (metrics.memory > 85) {
      this.addAlert('warning', 'system', `High memory usage: ${metrics.memory.toFixed(1)}%`);
    }

    // Check disk alert
    if (metrics.disk > 90) {
      this.addAlert('critical', 'storage', `Critical disk usage: ${metrics.disk.toFixed(1)}%`);
    }

    // Check component health
    this.components.forEach(component => {
      if (component.status === 'error') {
        this.addAlert('error', component.id, `${component.name} is experiencing issues`);
      }
    });
  }

  /**
   * Add alert
   */
  private addAlert(level: AlertLevel, component: string, message: string, details?: any) {
    const alert: AlertEvent = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level,
      component,
      message,
      timestamp: new Date(),
      details,
    };

    this.alerts.push(alert);
    this.emit('alert:new', alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
  }

  /**
   * Add error
   */
  private addError(component: string, message: string, error: any) {
    const errorKey = `${component}:${message}`;
    
    if (this.errors.has(errorKey)) {
      const pattern = this.errors.get(errorKey)!;
      pattern.count++;
      pattern.lastOccurrence = new Date();
    } else {
      const pattern: ErrorPattern = {
        id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        component,
        message,
        count: 1,
        firstOccurrence: new Date(),
        lastOccurrence: new Date(),
        pattern: error?.stack || error?.message || String(error),
      };
      this.errors.set(errorKey, pattern);
    }

    this.emit('error:new', this.errors.get(errorKey));
  }

  /**
   * Get disk usage percentage
   */
  private async getDiskUsage(): Promise<number> {
    try {
      // This is a simplified version
      // In production, you'd use a library like 'diskusage'
      const used = process.memoryUsage().rss;
      const total = os.totalmem();
      return (used / total) * 100;
    } catch {
      return 0;
    }
  }

  /**
   * Get network statistics
   */
  private async getNetworkStats(): Promise<{ in: number; out: number }> {
    // This would need actual network monitoring
    // For now, return placeholder values
    return {
      in: Math.random() * 1000,
      out: Math.random() * 1000,
    };
  }

  /**
   * Get current system health
   */
  getHealth(): SystemHealth {
    return this.calculateOverallHealth();
  }

  /**
   * Get specific component health
   */
  getComponentHealth(componentId: string): ComponentHealth | undefined {
    return this.components.get(componentId);
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit: number = 50): AlertEvent[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get error patterns
   */
  getErrors(): ErrorPattern[] {
    return Array.from(this.errors.values());
  }

  /**
   * Get recent metrics
   */
  getMetrics(limit: number = 20): SystemMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Refresh specific component
   */
  async refreshComponent(componentId: string) {
    switch (componentId) {
      case 'api':
        await this.checkAPIHealth();
        break;
      case 'database':
        await this.checkDatabaseHealth();
        break;
      case 'cache':
        await this.checkCacheHealth();
        break;
      case 'queue':
        await this.checkQueueHealth();
        break;
      case 'storage':
        await this.checkStorageHealth();
        break;
    }
    
    const component = this.components.get(componentId);
    if (component) {
      this.emit('component:update', component);
    }
  }
}

// Export singleton instance
export const monitoringAgent = new MonitoringAgent();