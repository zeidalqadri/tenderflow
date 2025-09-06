/**
 * Integration tests for the hybrid ingestion pipeline
 */

import { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { buildTestServer } from '../helpers/test-server';
import { prisma } from '../../database/client';
import { generateMockTender, generateScraperToken } from '../helpers/fixtures';

describe('Ingestion Pipeline Integration', () => {
  let app: FastifyInstance;
  let scraperToken: string;
  const scraperId = 'test-scraper-01';
  const tenantId = 'test-tenant';

  beforeAll(async () => {
    app = await buildTestServer();
    scraperToken = await generateScraperToken(app, { scraperId, tenantId, type: 'scraper' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.tender.deleteMany({ where: { tenantId } });
    await prisma.scrapingLog.deleteMany({ where: { tenantId } });
  });

  describe('POST /api/ingestion/tenders', () => {
    it('should successfully ingest valid tender data', async () => {
      const batchId = uuidv4();
      const tenders = [
        generateMockTender(),
        generateMockTender(),
        generateMockTender()
      ];

      const dataString = JSON.stringify(tenders);
      const checksum = createHash('sha256').update(dataString).digest('hex');

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${scraperToken}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenders,
          metadata: {
            scraperId,
            batchId,
            scrapedAt: new Date().toISOString(),
            checksum,
            pageNumber: 1,
            totalPages: 5
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        uploadId: expect.any(String),
        status: 'completed',
        processed: 3,
        skipped: 0
      });

      // Verify tenders were saved
      const savedTenders = await prisma.tender.findMany({
        where: { tenantId }
      });
      expect(savedTenders).toHaveLength(3);
    });

    it('should reject requests with invalid checksum', async () => {
      const batchId = uuidv4();
      const tenders = [generateMockTender()];

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${scraperToken}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenders,
          metadata: {
            scraperId,
            batchId,
            scrapedAt: new Date().toISOString(),
            checksum: 'invalid-checksum',
            pageNumber: 1,
            totalPages: 1
          }
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Data integrity check failed');
    });

    it('should detect and skip duplicate batches', async () => {
      const batchId = uuidv4();
      const tenders = [generateMockTender()];
      const dataString = JSON.stringify(tenders);
      const checksum = createHash('sha256').update(dataString).digest('hex');

      const payload = {
        tenders,
        metadata: {
          scraperId,
          batchId,
          scrapedAt: new Date().toISOString(),
          checksum,
          pageNumber: 1,
          totalPages: 1
        }
      };

      // First request
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${scraperToken}`,
          'Content-Type': 'application/json'
        },
        payload
      });
      expect(response1.statusCode).toBe(200);

      // Duplicate request
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${scraperToken}`,
          'Content-Type': 'application/json'
        },
        payload
      });

      expect(response2.statusCode).toBe(200);
      const body = JSON.parse(response2.body);
      expect(body.status).toBe('duplicate');
      expect(body.skipped).toBe(tenders.length);
    });

    it('should handle rate limiting correctly', async () => {
      // Make multiple rapid requests
      const promises = [];
      for (let i = 0; i < 150; i++) {
        const batchId = uuidv4();
        const tenders = [generateMockTender()];
        const dataString = JSON.stringify(tenders);
        const checksum = createHash('sha256').update(dataString).digest('hex');

        promises.push(
          app.inject({
            method: 'POST',
            url: '/api/ingestion/tenders',
            headers: {
              Authorization: `Bearer ${scraperToken}`,
              'Content-Type': 'application/json'
            },
            payload: {
              tenders,
              metadata: {
                scraperId,
                batchId,
                scrapedAt: new Date().toISOString(),
                checksum
              }
            }
          })
        );
      }

      const responses = await Promise.all(promises);
      const rateLimited = responses.filter(r => r.statusCode === 429);
      
      // Should have some rate limited responses
      expect(rateLimited.length).toBeGreaterThan(0);
      
      // Rate limited responses should have retry-after header
      if (rateLimited.length > 0) {
        const body = JSON.parse(rateLimited[0].body);
        expect(body).toHaveProperty('retryAfter');
      }
    });

    it('should sanitize potentially malicious input', async () => {
      const batchId = uuidv4();
      const maliciousTender = {
        id: 'test-123',
        title: '<script>alert("XSS")</script>Tender Title',
        status: 'ACTIVE<img src=x onerror=alert(1)>',
        value: '1000000',
        url: 'javascript:alert(1)',
        deadline: new Date().toISOString(),
        sourcePortal: 'test-portal'
      };

      const tenders = [maliciousTender];
      const dataString = JSON.stringify(tenders);
      const checksum = createHash('sha256').update(dataString).digest('hex');

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${scraperToken}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenders,
          metadata: {
            scraperId,
            batchId,
            scrapedAt: new Date().toISOString(),
            checksum
          }
        }
      });

      expect(response.statusCode).toBe(200);

      // Check that data was sanitized
      const savedTender = await prisma.tender.findFirst({
        where: { externalId: 'test-123' }
      });
      
      expect(savedTender?.title).not.toContain('<script>');
      expect(savedTender?.title).not.toContain('alert');
      expect(savedTender?.status).not.toContain('<img');
    });

    it('should handle batch size limits', async () => {
      const batchId = uuidv4();
      // Create more than 100 tenders (the limit)
      const tenders = Array.from({ length: 150 }, () => generateMockTender());
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${scraperToken}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenders,
          metadata: {
            scraperId,
            batchId,
            scrapedAt: new Date().toISOString(),
            checksum: 'dummy' // Will fail validation anyway
          }
        }
      });

      // Should reject due to schema validation (max 100 items)
      expect(response.statusCode).toBe(400);
    });

    it('should update existing tenders when re-ingested', async () => {
      const tenderId = 'tender-001';
      const batchId1 = uuidv4();
      
      // First ingestion
      const tender1 = {
        id: tenderId,
        title: 'Original Title',
        status: 'ACTIVE',
        value: '1000000',
        sourcePortal: 'test-portal',
        deadline: new Date().toISOString()
      };
      
      const dataString1 = JSON.stringify([tender1]);
      const checksum1 = createHash('sha256').update(dataString1).digest('hex');

      await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${scraperToken}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenders: [tender1],
          metadata: {
            scraperId,
            batchId: batchId1,
            scrapedAt: new Date().toISOString(),
            checksum: checksum1
          }
        }
      });

      // Second ingestion with updated data
      const batchId2 = uuidv4();
      const tender2 = {
        ...tender1,
        title: 'Updated Title',
        status: 'CLOSED',
        value: '2000000'
      };
      
      const dataString2 = JSON.stringify([tender2]);
      const checksum2 = createHash('sha256').update(dataString2).digest('hex');

      const response2 = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${scraperToken}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenders: [tender2],
          metadata: {
            scraperId,
            batchId: batchId2,
            scrapedAt: new Date().toISOString(),
            checksum: checksum2
          }
        }
      });

      expect(response2.statusCode).toBe(200);
      const body = JSON.parse(response2.body);
      expect(body.skipped).toBe(1); // Should be marked as skipped (updated)

      // Verify tender was updated
      const savedTender = await prisma.tender.findFirst({
        where: { externalId: tenderId }
      });
      
      expect(savedTender?.title).toBe('Updated Title');
      expect(savedTender?.status).toBe('CLOSED');
      expect(savedTender?.estimatedValue).toBe('2000000');
    });
  });

  describe('GET /api/ingestion/status/:uploadId', () => {
    it('should return status for valid upload', async () => {
      const uploadId = uuidv4();
      
      // Create a scraping log
      await prisma.scrapingLog.create({
        data: {
          tenantId,
          status: 'COMPLETED',
          sourcePortal: 'test-portal',
          tendersScraped: 10,
          tendersTotal: 12,
          startedAt: new Date(),
          completedAt: new Date(),
          metadata: { uploadId, batchId: uuidv4(), scraperId },
          triggeredBy: 'API'
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/ingestion/status/${uploadId}`,
        headers: {
          Authorization: `Bearer ${scraperToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        uploadId,
        status: 'COMPLETED',
        processed: 10,
        total: 12
      });
    });

    it('should return 404 for non-existent upload', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/ingestion/status/${uuidv4()}`,
        headers: {
          Authorization: `Bearer ${scraperToken}`
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Upload not found');
    });
  });

  describe('GET /api/ingestion/health', () => {
    it('should return health status without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ingestion/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        services: {
          database: true,
          api: true
        }
      });
    });
  });

  describe('GET /api/ingestion/metrics', () => {
    it('should return scraper metrics', async () => {
      // Create some scraping logs
      await prisma.scrapingLog.createMany({
        data: [
          {
            tenantId,
            status: 'COMPLETED',
            sourcePortal: 'test-portal',
            tendersScraped: 10,
            tendersTotal: 10,
            startedAt: new Date(),
            completedAt: new Date(),
            metadata: { scraperId },
            triggeredBy: 'API'
          },
          {
            tenantId,
            status: 'FAILED',
            sourcePortal: 'test-portal',
            tendersScraped: 0,
            tendersTotal: 5,
            startedAt: new Date(),
            completedAt: new Date(),
            metadata: { scraperId },
            triggeredBy: 'API'
          }
        ]
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/ingestion/metrics',
        headers: {
          Authorization: `Bearer ${scraperToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        scraperId,
        metrics: {
          totalIngested: 10,
          totalErrors: 1,
          lastIngestionAt: expect.any(String)
        }
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should reject requests without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: {
          tenders: [],
          metadata: {
            scraperId: 'test',
            batchId: uuidv4(),
            scrapedAt: new Date().toISOString(),
            checksum: 'test'
          }
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Missing authentication token');
    });

    it('should reject requests with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: 'Bearer invalid-token',
          'Content-Type': 'application/json'
        },
        payload: {
          tenders: [],
          metadata: {
            scraperId: 'test',
            batchId: uuidv4(),
            scrapedAt: new Date().toISOString(),
            checksum: 'test'
          }
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
    });

    it('should reject non-scraper tokens', async () => {
      // Generate a regular user token
      const userToken = await generateScraperToken(app, { 
        userId: 'test-user',
        type: 'user' // Not a scraper token
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/tenders',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenders: [],
          metadata: {
            scraperId: 'test',
            batchId: uuidv4(),
            scrapedAt: new Date().toISOString(),
            checksum: 'test'
          }
        }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid token type');
    });
  });
});