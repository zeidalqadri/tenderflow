import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES } from '../queues';
import { 
  processReceiptParse,
  processFile, 
  processAlertDispatch,
  processRulesApplication,
  processOcr 
} from '../processors';

// Redis connection for workers
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true,
});

// Worker configurations
const workerConfig = {
  connection: redisConnection,
  concurrency: 5,
  removeOnComplete: 100,
  removeOnFail: 50,
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 3,
  },
};

// Initialize workers
export const receiptParseWorker = new Worker(
  QUEUE_NAMES.RECEIPT_PARSE,
  processReceiptParse,
  {
    ...workerConfig,
    concurrency: 3, // Limit concurrency for resource-intensive OCR
  }
);

export const fileProcessWorker = new Worker(
  QUEUE_NAMES.FILE_PROCESS,
  processFile,
  {
    ...workerConfig,
    concurrency: 5,
  }
);

export const alertDispatchWorker = new Worker(
  QUEUE_NAMES.ALERT_DISPATCH,
  processAlertDispatch,
  {
    ...workerConfig,
    concurrency: 10, // Higher concurrency for I/O bound tasks
  }
);

export const rulesApplicationWorker = new Worker(
  QUEUE_NAMES.RULES_APPLICATION,
  processRulesApplication,
  {
    ...workerConfig,
    concurrency: 5,
  }
);

export const ocrProcessWorker = new Worker(
  QUEUE_NAMES.OCR_PROCESS,
  processOcr,
  {
    ...workerConfig,
    concurrency: 2, // Very limited for CPU-intensive OCR
  }
);

// Worker event handlers
const workers = [
  receiptParseWorker,
  fileProcessWorker,
  alertDispatchWorker,
  rulesApplicationWorker,
  ocrProcessWorker,
];

workers.forEach(worker => {
  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed in queue ${worker.name}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed in queue ${worker.name}:`, err);
  });

  worker.on('error', (err) => {
    console.error(`Worker error in ${worker.name}:`, err);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`Job ${jobId} stalled in queue ${worker.name}`);
  });
});

// Graceful shutdown
export async function closeWorkers(): Promise<void> {
  console.log('Shutting down workers...');
  
  await Promise.all([
    ...workers.map(worker => worker.close()),
    redisConnection.disconnect(),
  ]);
  
  console.log('Workers shut down successfully');
}

// Handle process signals
process.on('SIGTERM', async () => {
  await closeWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeWorkers();
  process.exit(0);
});

// Export all workers
export const allWorkers = workers;