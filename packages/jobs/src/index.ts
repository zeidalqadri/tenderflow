// Export job workers, processors, and queues
export * from './workers';
export * from './processors';
export * from './queues';
export * from './services/ocr';
export * from './services/file-storage';
export * from './extractors';

// Job scheduler functions for easy use
import { 
  receiptParseQueue, 
  fileProcessQueue,
  alertDispatchQueue,
  rulesApplicationQueue,
  ocrProcessQueue,
  ReceiptParseJobData,
  FileProcessJobData,
  AlertDispatchJobData,
  RulesApplicationJobData,
  OCRProcessJobData
} from './queues';

/**
 * Schedule receipt parsing job
 */
export async function scheduleReceiptParse(
  data: ReceiptParseJobData,
  options: {
    priority?: number;
    delay?: number;
    attempts?: number;
  } = {}
): Promise<string> {
  const job = await receiptParseQueue.add('parse-receipt', data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
    attempts: options.attempts || 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  });
  
  return job.id!;
}

/**
 * Schedule file processing job
 */
export async function scheduleFileProcess(
  data: FileProcessJobData,
  options: {
    priority?: number;
    delay?: number;
  } = {}
): Promise<string> {
  const job = await fileProcessQueue.add('process-file', data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
  });
  
  return job.id!;
}

/**
 * Schedule alert dispatch job
 */
export async function scheduleAlertDispatch(
  data: AlertDispatchJobData,
  options: {
    priority?: number;
    delay?: number;
  } = {}
): Promise<string> {
  const priority = data.priority === 'urgent' ? 10 : 
                   data.priority === 'high' ? 5 : 
                   data.priority === 'low' ? -5 : 0;

  const job = await alertDispatchQueue.add('dispatch-alert', data, {
    priority: options.priority || priority,
    delay: options.delay || 0,
  });
  
  return job.id!;
}

/**
 * Schedule rules application job
 */
export async function scheduleRulesApplication(
  data: RulesApplicationJobData,
  options: {
    priority?: number;
    delay?: number;
  } = {}
): Promise<string> {
  const job = await rulesApplicationQueue.add('apply-rules', data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
  });
  
  return job.id!;
}

/**
 * Schedule OCR processing job
 */
export async function scheduleOcrProcess(
  data: OCRProcessJobData,
  options: {
    priority?: number;
    delay?: number;
  } = {}
): Promise<string> {
  const job = await ocrProcessQueue.add('process-ocr', data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
  });
  
  return job.id!;
}

/**
 * Get job status by ID
 */
export async function getJobStatus(queueName: string, jobId: string) {
  const queue = {
    'receipt-parse': receiptParseQueue,
    'file-process': fileProcessQueue,
    'alert-dispatch': alertDispatchQueue,
    'rules-application': rulesApplicationQueue,
    'ocr-process': ocrProcessQueue,
  }[queueName];

  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    progress: job.progress,
    status: await job.getState(),
    createdAt: new Date(job.timestamp),
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
    failedReason: job.failedReason,
    returnValue: job.returnvalue,
  };
}