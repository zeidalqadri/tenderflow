/**
 * System Control Service
 * Provides control capabilities for system components
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { CacheManager } from './redis';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import type { RemediationAction, RemediationStatus } from '@tenderflow/shared';

const execAsync = promisify(exec);

export class SystemControlService {
  private cache: CacheManager;
  private remediationActions: Map<string, RemediationAction> = new Map();

  constructor() {
    this.cache = new CacheManager();
    this.initializeRemediationActions();
  }

  private initializeRemediationActions() {
    // Define available remediation actions
    const actions: RemediationAction[] = [
      {
        id: 'restart_api',
        name: 'Restart API Service',
        description: 'Restart the API service to resolve performance issues',
        component: 'api',
        type: 'restart',
        confidence: 85,
        impact: 'medium',
        requiresApproval: false,
      },
      {
        id: 'clear_cache',
        name: 'Clear Redis Cache',
        description: 'Clear all cached data to resolve stale data issues',
        component: 'cache',
        type: 'clear_cache',
        confidence: 95,
        impact: 'low',
        requiresApproval: false,
      },
      {
        id: 'reset_db_pool',
        name: 'Reset Database Connection Pool',
        description: 'Reset database connections to resolve connection issues',
        component: 'database',
        type: 'reset_connection',
        confidence: 75,
        impact: 'medium',
        requiresApproval: false,
      },
      {
        id: 'scale_workers',
        name: 'Scale Worker Processes',
        description: 'Increase worker processes to handle high load',
        component: 'queue',
        type: 'scale',
        confidence: 90,
        impact: 'low',
        requiresApproval: false,
      },
      {
        id: 'rotate_credentials',
        name: 'Rotate API Credentials',
        description: 'Rotate API keys and secrets for security',
        component: 'security',
        type: 'rotate_credentials',
        confidence: 98,
        impact: 'high',
        requiresApproval: true,
      },
    ];

    actions.forEach(action => {
      this.remediationActions.set(action.id, action);
    });
  }

  /**
   * Execute a remediation action
   */
  async executeRemediation(actionId: string): Promise<RemediationAction> {
    const action = this.remediationActions.get(actionId);
    if (!action) {
      throw new Error(`Remediation action ${actionId} not found`);
    }

    // Check if approval is required
    if (action.requiresApproval && !action.executedBy) {
      throw new Error('This action requires approval');
    }

    // Update status
    action.status = 'executing';
    action.executedAt = new Date();

    try {
      switch (action.type) {
        case 'restart':
          await this.restartComponent(action.component);
          break;
        case 'clear_cache':
          await this.clearCache();
          break;
        case 'reset_connection':
          await this.resetConnectionPool(action.component);
          break;
        case 'scale':
          await this.scaleComponent(action.component, 2); // Default to 2 replicas
          break;
        case 'rotate_credentials':
          await this.rotateCredentials();
          break;
        default:
          throw new Error(`Unknown remediation type: ${action.type}`);
      }

      action.status = 'completed';
      action.result = {
        success: true,
        message: `Successfully executed ${action.name}`,
      };

      logger.info(`Remediation completed: ${action.name}`);
    } catch (error) {
      action.status = 'failed';
      action.result = {
        success: false,
        message: error instanceof Error ? error.message : 'Remediation failed',
      };

      logger.error(`Remediation failed: ${action.name}`, error);
      throw error;
    }

    return action;
  }

  /**
   * Restart a component
   */
  async restartComponent(componentId: string): Promise<void> {
    logger.info(`Restarting component: ${componentId}`);

    switch (componentId) {
      case 'api':
        // In production, this would trigger a graceful restart
        // For development, we'll just log it
        logger.info('API restart requested - would restart in production');
        break;
      
      case 'queue':
        // Restart queue workers
        try {
          // This would restart BullMQ workers in production
          logger.info('Queue workers restart requested');
        } catch (error) {
          logger.error('Failed to restart queue workers', error);
          throw error;
        }
        break;

      case 'scraper':
        // Restart scraper service
        try {
          // This would restart the Python scraper in production
          logger.info('Scraper restart requested');
        } catch (error) {
          logger.error('Failed to restart scraper', error);
          throw error;
        }
        break;

      default:
        throw new Error(`Cannot restart component: ${componentId}`);
    }
  }

  /**
   * Scale a component
   */
  async scaleComponent(componentId: string, replicas: number): Promise<void> {
    logger.info(`Scaling component ${componentId} to ${replicas} replicas`);

    switch (componentId) {
      case 'api':
        // In production with Cloud Run, this would scale the service
        logger.info(`API scaled to ${replicas} replicas (simulated)`);
        break;

      case 'queue':
        // Scale queue workers
        logger.info(`Queue workers scaled to ${replicas} (simulated)`);
        break;

      default:
        throw new Error(`Cannot scale component: ${componentId}`);
    }
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    logger.info('Clearing cache');
    
    try {
      await this.cache.flushAll();
      logger.info('Cache cleared successfully');
    } catch (error) {
      logger.error('Failed to clear cache', error);
      throw error;
    }
  }

  /**
   * Reset connection pool
   */
  async resetConnectionPool(component: string): Promise<void> {
    logger.info(`Resetting connection pool for ${component}`);

    switch (component) {
      case 'database':
        // Reset Prisma connection
        try {
          await prisma.$disconnect();
          await prisma.$connect();
          logger.info('Database connection pool reset');
        } catch (error) {
          logger.error('Failed to reset database connection pool', error);
          throw error;
        }
        break;

      case 'cache':
        // Reset Redis connection
        try {
          await this.cache.reconnect();
          logger.info('Cache connection pool reset');
        } catch (error) {
          logger.error('Failed to reset cache connection pool', error);
          throw error;
        }
        break;

      default:
        throw new Error(`Cannot reset connection pool for: ${component}`);
    }
  }

  /**
   * Rotate credentials
   */
  async rotateCredentials(): Promise<void> {
    logger.info('Rotating credentials');
    
    // In production, this would:
    // 1. Generate new credentials
    // 2. Update environment variables
    // 3. Trigger a rolling restart
    
    logger.info('Credentials rotation requested - would rotate in production');
  }

  /**
   * Execute system command (with caution)
   */
  private async executeCommand(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        logger.warn(`Command stderr: ${stderr}`);
      }
      return stdout;
    } catch (error) {
      logger.error(`Command failed: ${command}`, error);
      throw error;
    }
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<any> {
    const status = {
      api: await this.checkAPIStatus(),
      database: await this.checkDatabaseStatus(),
      cache: await this.checkCacheStatus(),
      queue: await this.checkQueueStatus(),
    };

    return status;
  }

  /**
   * Check API status
   */
  private async checkAPIStatus(): Promise<boolean> {
    // Check if API is responding
    return true; // Simplified for now
  }

  /**
   * Check database status
   */
  private async checkDatabaseStatus(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check cache status
   */
  private async checkCacheStatus(): Promise<boolean> {
    try {
      await this.cache.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check queue status
   */
  private async checkQueueStatus(): Promise<boolean> {
    // Check BullMQ queue status
    return true; // Simplified for now
  }

  /**
   * Get available remediation actions
   */
  getAvailableActions(): RemediationAction[] {
    return Array.from(this.remediationActions.values());
  }

  /**
   * Get remediation action by ID
   */
  getAction(actionId: string): RemediationAction | undefined {
    return this.remediationActions.get(actionId);
  }
}

// Export singleton instance
export const systemControl = new SystemControlService();