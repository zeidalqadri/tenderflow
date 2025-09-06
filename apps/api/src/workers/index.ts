import { createLogger, logInfo, logError, logSuccess } from '../utils/logger';
import scrapingWorker from './scraping.worker';
import processingWorker from './processing.worker';
import notificationWorker from './notification.worker';
import documentWorker from './document.worker';
import cleanupWorker from './cleanup.worker';
import { setupRecurringJobs, shutdownQueues } from '../services/queue';
import { shutdownRedis } from '../services/redis';

const logger = createLogger('WORKER_MANAGER');

export class WorkerManager {
  private static instance: WorkerManager;
  private workers: any[] = [];
  private isRunning = false;

  private constructor() {}

  static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logInfo('MANAGER', 'Workers already running');
      return;
    }

    try {
      logInfo('MANAGER', 'Starting worker processes...');

      // Initialize all workers
      this.workers = [
        scrapingWorker,
        processingWorker,
        notificationWorker,
        documentWorker,
        cleanupWorker,
      ];

      // Setup recurring jobs
      await setupRecurringJobs();

      this.isRunning = true;
      
      logSuccess('MANAGER', `Started ${this.workers.length} worker processes`);
      
      // Log worker status
      for (const worker of this.workers) {
        logInfo('MANAGER', `Worker ${worker.name} is running with concurrency ${worker.opts.concurrency}`);
      }

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();

    } catch (error) {
      logError('MANAGER', 'Failed to start workers', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logInfo('MANAGER', 'Workers not running');
      return;
    }

    try {
      logInfo('MANAGER', 'Stopping worker processes...');

      // Close all workers
      const closePromises = this.workers.map(worker => worker.close());
      await Promise.all(closePromises);

      // Shutdown queues and Redis
      await shutdownQueues();
      await shutdownRedis();

      this.isRunning = false;
      
      logSuccess('MANAGER', 'All workers stopped successfully');
      
    } catch (error) {
      logError('MANAGER', 'Error stopping workers', error as Error);
      throw error;
    }
  }

  async pause(): Promise<void> {
    if (!this.isRunning) {
      logInfo('MANAGER', 'Workers not running');
      return;
    }

    try {
      logInfo('MANAGER', 'Pausing all workers...');
      
      const pausePromises = this.workers.map(worker => worker.pause());
      await Promise.all(pausePromises);
      
      logSuccess('MANAGER', 'All workers paused');
      
    } catch (error) {
      logError('MANAGER', 'Error pausing workers', error as Error);
      throw error;
    }
  }

  async resume(): Promise<void> {
    if (!this.isRunning) {
      logInfo('MANAGER', 'Workers not running');
      return;
    }

    try {
      logInfo('MANAGER', 'Resuming all workers...');
      
      const resumePromises = this.workers.map(worker => worker.resume());
      await Promise.all(resumePromises);
      
      logSuccess('MANAGER', 'All workers resumed');
      
    } catch (error) {
      logError('MANAGER', 'Error resuming workers', error as Error);
      throw error;
    }
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      workers: this.workers.map(worker => ({
        name: worker.name,
        isPaused: worker.isPaused(),
        isRunning: worker.isRunning(),
        concurrency: worker.opts.concurrency,
      })),
    };
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logInfo('MANAGER', `Received ${signal}, shutting down gracefully...`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logError('MANAGER', 'Error during shutdown', error as Error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2'));
  }
}

// Export singleton instance
export const workerManager = WorkerManager.getInstance();

// Export individual workers for testing
export {
  scrapingWorker,
  processingWorker,
  notificationWorker,
  documentWorker,
  cleanupWorker,
};

// Start workers if running as standalone process
if (require.main === module) {
  (async () => {
    try {
      await workerManager.start();
      logInfo('MAIN', 'Worker processes started successfully');
    } catch (error) {
      logError('MAIN', 'Failed to start worker processes', error as Error);
      process.exit(1);
    }
  })();
}