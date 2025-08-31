import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true,
};

// Create Redis connection for queues
const redisConnection = new IORedis(redisConfig);

// Default queue options
const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,     // Keep last 50 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
};

// Queue definitions
export const QUEUE_NAMES = {
  RECEIPT_PARSE: 'receipt-parse',
  FILE_PROCESS: 'file-process',
  ALERT_DISPATCH: 'alert-dispatch',
  RULES_APPLICATION: 'rules-application',
  OCR_PROCESS: 'ocr-process',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// Initialize queues
export const receiptParseQueue = new Queue(QUEUE_NAMES.RECEIPT_PARSE, defaultQueueOptions);
export const fileProcessQueue = new Queue(QUEUE_NAMES.FILE_PROCESS, defaultQueueOptions);
export const alertDispatchQueue = new Queue(QUEUE_NAMES.ALERT_DISPATCH, defaultQueueOptions);
export const rulesApplicationQueue = new Queue(QUEUE_NAMES.RULES_APPLICATION, defaultQueueOptions);
export const ocrProcessQueue = new Queue(QUEUE_NAMES.OCR_PROCESS, defaultQueueOptions);

// Queue registry for easy access
export const queues = {
  [QUEUE_NAMES.RECEIPT_PARSE]: receiptParseQueue,
  [QUEUE_NAMES.FILE_PROCESS]: fileProcessQueue,
  [QUEUE_NAMES.ALERT_DISPATCH]: alertDispatchQueue,
  [QUEUE_NAMES.RULES_APPLICATION]: rulesApplicationQueue,
  [QUEUE_NAMES.OCR_PROCESS]: ocrProcessQueue,
} as const;

// Job data types
export interface ReceiptParseJobData {
  submissionId: string;
  receiptKey: string;
  tenantId: string;
  userId: string;
  metadata?: Record<string, any>;
}

export interface FileProcessJobData {
  fileKey: string;
  bucket: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  tenantId: string;
  metadata?: Record<string, any>;
}

export interface AlertDispatchJobData {
  type: 'email' | 'webhook' | 'push';
  recipients: string[];
  subject?: string;
  message: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface RulesApplicationJobData {
  tenderId: string;
  submissionId?: string;
  documentId?: string;
  rulesetId?: string;
  context: Record<string, any>;
}

export interface OCRProcessJobData {
  fileKey: string;
  bucket: string;
  language?: string[];
  outputFormat?: 'text' | 'json' | 'pdf';
  preprocessing?: {
    denoise?: boolean;
    contrast?: boolean;
    deskew?: boolean;
    resize?: boolean;
  };
}

// Job result types
export interface ReceiptParseResult {
  success: boolean;
  parsed?: {
    portalId?: string;
    submissionRef?: string;
    amount?: number;
    currency?: string;
    timestamp?: Date;
    status?: string;
    bidder?: {
      name?: string;
      identifier?: string;
      contact?: string;
    };
    tender?: {
      title?: string;
      reference?: string;
      deadline?: Date;
    };
    metadata?: Record<string, any>;
  };
  ocrText?: string;
  confidence?: number;
  error?: string;
  processingTime?: number;
}

export interface FileProcessResult {
  success: boolean;
  metadata?: {
    fileType?: string;
    dimensions?: { width: number; height: number };
    exif?: Record<string, any>;
    thumbnailKey?: string;
    virusScanResult?: 'clean' | 'infected' | 'error';
  };
  error?: string;
}

export interface OCRResult {
  success: boolean;
  text?: string;
  confidence?: number;
  blocks?: Array<{
    text: string;
    bbox: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
  language?: string;
  processingTime?: number;
  error?: string;
}

// Cleanup function for graceful shutdown
export async function closeQueues(): Promise<void> {
  await Promise.all([
    receiptParseQueue.close(),
    fileProcessQueue.close(),
    alertDispatchQueue.close(),
    rulesApplicationQueue.close(),
    ocrProcessQueue.close(),
    redisConnection.disconnect(),
  ]);
}

// Health check for queues
export async function getQueueHealth(): Promise<Record<string, any>> {
  const health: Record<string, any> = {};
  
  for (const [name, queue] of Object.entries(queues)) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);
      
      health[name] = {
        status: 'healthy',
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      health[name] = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  return health;
}