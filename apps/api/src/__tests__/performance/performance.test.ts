// Performance tests for TenderFlow API

import { FastifyInstance } from 'fastify';
import { TestServer } from '../helpers/test-server';
import { TEST_FIXTURES, createFixture } from '../helpers/fixtures';
import supertest from 'supertest';

describe('Performance Tests', () => {
  let testServer: TestServer;
  let server: FastifyInstance;
  let request: supertest.SuperTest<supertest.Test>;
  let testData: { tenant: any; user: any; token: string };

  beforeAll(async () => {
    testServer = new TestServer();
    server = await testServer.create();
    await server.ready();
    request = supertest(server.server);
  });

  afterAll(async () => {
    await testServer.cleanup();
  });

  beforeEach(async () => {
    await testServer.resetDatabase();
    testData = await testServer.seedTestData();
  });

  describe('Response Time Performance', () => {
    it('should respond to health check within 100ms', async () => {
      const start = Date.now();
      
      const response = await request
        .get('/api/v1/health')
        .expect(200);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(100);
      expect(response.headers['x-response-time']).toBeDefined();
    });

    it('should authenticate within 200ms', async () => {
      const start = Date.now();
      
      await request
        .post('/api/v1/auth/login')
        .send(TEST_FIXTURES.auth.login.valid)
        .expect(200);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(200);
    });

    it('should fetch tender list within 300ms', async () => {
      // Create some test data
      await Promise.all([
        request
          .post('/api/v1/tenders')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send(createFixture(TEST_FIXTURES.tender.scraped)),
        request
          .post('/api/v1/tenders')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send(createFixture({
            ...TEST_FIXTURES.tender.validated,
            title: 'Second Test Tender',
          })),
      ]);

      const start = Date.now();
      
      await request
        .get('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .expect(200);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(300);
    });

    it('should handle tender creation within 400ms', async () => {
      const start = Date.now();
      
      await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped))
        .expect(201);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(400);
    });
  });

  describe('Database Query Performance', () => {
    beforeEach(async () => {
      // Create bulk test data
      const prisma = testServer.getPrisma();
      
      const tenders = Array.from({ length: 100 }, (_, i) => ({
        ...createFixture(TEST_FIXTURES.tender.scraped),
        title: `Performance Test Tender ${i + 1}`,
        estimatedValue: Math.floor(Math.random() * 1000000) + 10000,
        tenantId: testData.tenant.id,
        createdById: testData.user.id,
      }));

      await prisma.tender.createMany({ data: tenders });
    });

    it('should paginate large datasets efficiently', async () => {
      const start = Date.now();
      
      const response = await request
        .get('/api/v1/tenders?page=1&limit=20')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .expect(200);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(200);
      
      expect(response.body.data).toHaveLength(20);
      expect(response.body.pagination.totalItems).toBeGreaterThan(100);
    });

    it('should filter large datasets efficiently', async () => {
      const start = Date.now();
      
      await request
        .get('/api/v1/tenders?category=IT_SERVICES&status=SCRAPED')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .expect(200);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(300);
    });

    it('should search efficiently with text queries', async () => {
      const start = Date.now();
      
      await request
        .get('/api/v1/tenders?search=Performance Test')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .expect(200);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(400);
    });

    it('should handle complex joins efficiently', async () => {
      // Create related data
      const prisma = testServer.getPrisma();
      const tender = await prisma.tender.create({
        data: {
          ...createFixture(TEST_FIXTURES.tender.scraped),
          tenantId: testData.tenant.id,
          createdById: testData.user.id,
        },
      });

      await prisma.document.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          ...createFixture(TEST_FIXTURES.document.pdf),
          filename: `document-${i + 1}.pdf`,
          tenderId: tender.id,
          tenantId: testData.tenant.id,
          uploadedById: testData.user.id,
        })),
      });

      const start = Date.now();
      
      await request
        .get(`/api/v1/tenders/${tender.id}?include=documents,submissions`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .expect(200);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(500);
    });
  });

  describe('Concurrent Request Performance', () => {
    it('should handle multiple concurrent reads', async () => {
      const concurrentRequests = 20;
      const promises = Array.from({ length: concurrentRequests }, () =>
        request
          .get('/api/v1/tenders')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
      );

      const start = Date.now();
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - start;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(2000);
      
      // Average response time should be reasonable
      const averageTime = totalTime / concurrentRequests;
      expect(averageTime).toBeLessThan(200);
    });

    it('should handle concurrent writes safely', async () => {
      const concurrentWrites = 10;
      const promises = Array.from({ length: concurrentWrites }, (_, i) =>
        request
          .post('/api/v1/tenders')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            ...createFixture(TEST_FIXTURES.tender.scraped),
            title: `Concurrent Test Tender ${i + 1}`,
          })
      );

      const start = Date.now();
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - start;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      expect(totalTime).toBeLessThan(3000);

      // Verify all tenders were created
      const listResponse = await request
        .get('/api/v1/tenders?search=Concurrent Test')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(listResponse.body.data).toHaveLength(concurrentWrites);
    });

    it('should handle mixed read/write workload', async () => {
      const readPromises = Array.from({ length: 15 }, () =>
        request
          .get('/api/v1/tenders')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
      );

      const writePromises = Array.from({ length: 5 }, (_, i) =>
        request
          .post('/api/v1/tenders')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            ...createFixture(TEST_FIXTURES.tender.scraped),
            title: `Mixed Workload Tender ${i + 1}`,
          })
      );

      const start = Date.now();
      const allResponses = await Promise.all([...readPromises, ...writePromises]);
      const totalTime = Date.now() - start;

      // All requests should succeed
      allResponses.forEach(response => {
        expect([200, 201]).toContain(response.status);
      });

      expect(totalTime).toBeLessThan(3000);
    });
  });

  describe('Memory Usage Performance', () => {
    it('should handle large document uploads efficiently', async () => {
      const largeContent = Buffer.alloc(10 * 1024 * 1024, 'x'); // 10MB
      
      const memBefore = process.memoryUsage().heapUsed;
      
      const response = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', largeContent, 'large-file.pdf')
        .field('type', 'tender-document');

      // Should handle large uploads (might fail due to size limits, that's ok)
      expect([201, 400]).toContain(response.status);
      
      // Memory usage should not increase drastically
      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = memAfter - memBefore;
      
      // Should not hold entire file in memory
      expect(memIncrease).toBeLessThan(largeContent.length);
    });

    it('should garbage collect after bulk operations', async () => {
      const memBefore = process.memoryUsage().heapUsed;
      
      // Create many tenders
      const promises = Array.from({ length: 50 }, (_, i) =>
        request
          .post('/api/v1/tenders')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            ...createFixture(TEST_FIXTURES.tender.scraped),
            title: `Memory Test Tender ${i + 1}`,
            description: 'A'.repeat(10000), // Large description
          })
      );

      await Promise.all(promises);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = memAfter - memBefore;
      
      // Memory increase should be reasonable
      expect(memIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('Resource Optimization', () => {
    it('should compress responses when requested', async () => {
      const response = await request
        .get('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .set('accept-encoding', 'gzip')
        .expect(200);

      expect(response.headers['content-encoding']).toBe('gzip');
    });

    it('should cache static responses appropriately', async () => {
      const response1 = await request
        .get('/api/v1/categories')
        .expect(200);

      expect(response1.headers['cache-control']).toContain('max-age=');
      expect(response1.headers['etag']).toBeDefined();

      // Second request should be cached
      const response2 = await request
        .get('/api/v1/categories')
        .set('if-none-match', response1.headers['etag'])
        .expect(304);

      expect(response2.text).toBe('');
    });

    it('should optimize database connections', async () => {
      const start = Date.now();
      
      // Make multiple requests that would normally require separate connections
      const promises = Array.from({ length: 10 }, () =>
        request
          .get('/api/v1/auth/me')
          .set('authorization', `Bearer ${testData.token}`)
      );

      await Promise.all(promises);
      
      const responseTime = Date.now() - start;
      
      // Should be efficient with connection pooling
      expect(responseTime).toBeLessThan(1000);
    });

    it('should batch database operations efficiently', async () => {
      const tenderData = Array.from({ length: 20 }, (_, i) => ({
        ...createFixture(TEST_FIXTURES.tender.scraped),
        title: `Batch Test Tender ${i + 1}`,
      }));

      const start = Date.now();
      
      const response = await request
        .post('/api/v1/tenders/batch')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({ tenders: tenderData });

      const responseTime = Date.now() - start;

      expect(response.status).toBe(201);
      expect(response.body.data.created).toBe(20);
      
      // Batch operation should be faster than individual operations
      expect(responseTime).toBeLessThan(2000);
    });
  });

  describe('Load Testing', () => {
    it('should maintain performance under sustained load', async () => {
      const testDuration = 5000; // 5 seconds
      const targetRPS = 10; // requests per second
      
      const startTime = Date.now();
      const responses: any[] = [];
      let requestCount = 0;
      
      const makeRequest = async (): Promise<void> => {
        if (Date.now() - startTime > testDuration) return;
        
        try {
          const response = await request
            .get('/api/v1/health')
            .timeout(1000);
          
          responses.push({
            status: response.status,
            responseTime: parseInt(response.headers['x-response-time'] || '0'),
          });
          
          requestCount++;
          
          // Schedule next request to maintain target RPS
          setTimeout(() => makeRequest(), 1000 / targetRPS);
        } catch (error: any) {
          responses.push({
            status: 500,
            error: error.message,
          });
        }
      };

      // Start multiple concurrent request chains
      await Promise.all(
        Array.from({ length: 3 }, () => makeRequest())
      );

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, testDuration + 1000));

      // Analyze results
      const successfulRequests = responses.filter(r => r.status === 200);
      const averageResponseTime = successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests.length;
      const successRate = successfulRequests.length / responses.length;

      expect(successRate).toBeGreaterThan(0.95); // 95% success rate
      expect(averageResponseTime).toBeLessThan(200); // Average response time under 200ms
      expect(requestCount).toBeGreaterThan(targetRPS * (testDuration / 1000) * 0.8); // Achieved at least 80% of target RPS
    });
  });

  describe('Performance Monitoring', () => {
    it('should provide performance metrics', async () => {
      const response = await request
        .get('/api/v1/metrics')
        .set('authorization', `Bearer ${testData.token}`)
        .expect(200);

      const metrics = response.body.data;
      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('requestCount');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('databaseConnections');
    });

    it('should track slow queries', async () => {
      // Make a complex query that might be slow
      await request
        .get('/api/v1/tenders?include=documents,submissions,history&sort=title&search=test')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .expect(200);

      const metricsResponse = await request
        .get('/api/v1/metrics/slow-queries')
        .set('authorization', `Bearer ${testData.token}`)
        .expect(200);

      const slowQueries = metricsResponse.body.data;
      expect(Array.isArray(slowQueries)).toBe(true);
      
      if (slowQueries.length > 0) {
        expect(slowQueries[0]).toHaveProperty('query');
        expect(slowQueries[0]).toHaveProperty('duration');
        expect(slowQueries[0]).toHaveProperty('timestamp');
      }
    });
  });
});