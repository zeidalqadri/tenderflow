import { jest } from '@jest/globals';

// Mock MinIO
jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    setBucketPolicy: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockReturnValue({
      on: jest.fn((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('mock file content'));
        } else if (event === 'end') {
          callback();
        }
      }),
    }),
    putObject: jest.fn().mockResolvedValue(undefined),
    statObject: jest.fn().mockResolvedValue({
      size: 1024,
      lastModified: new Date(),
      etag: 'mock-etag',
      metaData: { 'content-type': 'application/pdf' },
    }),
    presignedGetObject: jest.fn().mockResolvedValue('https://mock-url.com/file'),
    presignedPutObject: jest.fn().mockResolvedValue('https://mock-url.com/upload'),
    removeObject: jest.fn().mockResolvedValue(undefined),
    removeObjects: jest.fn().mockResolvedValue(undefined),
    listObjects: jest.fn().mockReturnValue({
      on: jest.fn(),
    }),
    listBuckets: jest.fn().mockResolvedValue([
      { name: 'test-bucket', creationDate: new Date() },
    ]),
  })),
}));

// Mock Tesseract
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn().mockResolvedValue({
    setParameters: jest.fn().mockResolvedValue(undefined),
    recognize: jest.fn().mockResolvedValue({
      data: {
        text: 'Mock OCR text content for testing',
        confidence: 85,
        blocks: [
          {
            text: 'Mock OCR text content for testing',
            bbox: { x0: 0, y0: 0, x1: 100, y1: 20 },
            confidence: 85,
          },
        ],
      },
    }),
    terminate: jest.fn().mockResolvedValue(undefined),
  }),
  PSM: {
    SINGLE_BLOCK: 6,
  },
}));

// Mock Jimp
jest.mock('jimp', () => ({
  read: jest.fn().mockResolvedValue({
    bitmap: { width: 800, height: 600 },
    scaleToFit: jest.fn().mockReturnThis(),
    contrast: jest.fn().mockReturnThis(),
    blur: jest.fn().mockReturnThis(),
    greyscale: jest.fn().mockReturnThis(),
    brightness: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    getBufferAsync: jest.fn().mockResolvedValue(Buffer.from('mock processed image')),
  }),
  MIME_PNG: 'image/png',
  MIME_JPEG: 'image/jpeg',
}));

// Mock file-type
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn().mockResolvedValue({
    ext: 'pdf',
    mime: 'application/pdf',
  }),
}));

// Mock sharp
jest.mock('sharp', () => jest.fn().mockReturnValue({
  metadata: jest.fn().mockResolvedValue({
    width: 800,
    height: 600,
    format: 'png',
  }),
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock thumbnail')),
}));

// Mock exifr
jest.mock('exifr', () => ({
  exifr: {
    parse: jest.fn().mockResolvedValue({
      Make: 'Mock Camera',
      Model: 'Mock Model',
      DateTime: '2024:01:01 12:00:00',
    }),
  },
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'mock-message-id',
      response: '250 OK',
    }),
  }),
}));

// Mock Prisma Client
const mockPrisma = {
  submission: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  tender: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  notification: {
    createMany: jest.fn(),
  },
  tenderValidation: {
    upsert: jest.fn(),
  },
  stateTransition: {
    create: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name) => ({
    name,
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJob: jest.fn(),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock IORedis
jest.mock('ioredis', () => 
  jest.fn().mockImplementation(() => ({
    disconnect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  }))
);

// Export mocked Prisma for tests
export { mockPrisma };

// Setup global test environment
beforeAll(async () => {
  // Any global setup needed
});

afterAll(async () => {
  // Any global cleanup needed
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Any per-test cleanup
});