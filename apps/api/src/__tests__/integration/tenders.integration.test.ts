// Tender integration tests for TenderFlow API
// This file preserves the original tender tests while adding comprehensive integration coverage

import { FastifyInstance } from 'fastify';
import { TestServer } from '../helpers/test-server';
import { TEST_FIXTURES, createFixture } from '../helpers/fixtures';
import supertest from 'supertest';

describe('Tender Integration Tests', () => {
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

  // ORIGINAL TESTS FROM SPECIFICATION - PRESERVED EXACTLY
  describe('POST /tenders', () => {
    it('should create new tender', async () => {
      const response = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          title: 'Test Tender',
          description: 'A test tender description',
          category: 'IT_SERVICES',
          deadline: '2024-12-31T23:59:59.000Z',
          estimatedValue: 100000,
          currency: 'USD',
        });

      expect(response.status).toBe(201);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data.title).toBe('Test Tender');
      expect(body.data.status).toBe('SCRAPED');
    });

    it('should validate required fields', async () => {
      const response = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          description: 'Missing title',
        });

      expect(response.status).toBe(400);
      const body = response.body;
      expect(body.error).toContain('Validation');
    });
  });

  describe('GET /tenders', () => {
    let tenderId: string;

    beforeEach(async () => {
      // Create a test tender
      const createResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));
      
      tenderId = createResponse.body.data.id;
    });

    it('should return paginated tenders', async () => {
      const response = await request
        .get('/api/v1/tenders?page=1&limit=10')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.pagination).toHaveProperty('page');
      expect(body.pagination).toHaveProperty('totalPages');
    });

    it('should filter by status', async () => {
      const response = await request
        .get('/api/v1/tenders?status=SCRAPED')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.success).toBe(true);
    });
  });

  describe('GET /tenders/:id', () => {
    let tenderId: string;

    beforeEach(async () => {
      const createResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));
      
      tenderId = createResponse.body.data.id;
    });

    it('should return tender by ID', async () => {
      const response = await request
        .get(`/api/v1/tenders/${tenderId}`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(tenderId);
    });

    it('should return 404 for non-existent tender', async () => {
      const response = await request
        .get('/api/v1/tenders/00000000-0000-0000-0000-000000000000')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /tenders/:id', () => {
    let tenderId: string;

    beforeEach(async () => {
      const createResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));
      
      tenderId = createResponse.body.data.id;
    });

    it('should update tender', async () => {
      const response = await request
        .put(`/api/v1/tenders/${tenderId}`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          title: 'Updated Test Tender',
          estimatedValue: 150000,
        });

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data.title).toBe('Updated Test Tender');
      expect(body.data.estimatedValue).toBe(150000);
    });
  });

  describe('POST /tenders/:id/transition', () => {
    let tenderId: string;

    beforeEach(async () => {
      const createResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));
      
      tenderId = createResponse.body.data.id;
    });

    it('should transition tender state', async () => {
      const response = await request
        .post(`/api/v1/tenders/${tenderId}/transition`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          toStatus: 'VALIDATED',
          reason: 'Tender has been validated',
        });

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('VALIDATED');
    });

    it('should reject invalid state transition', async () => {
      const response = await request
        .post(`/api/v1/tenders/${tenderId}/transition`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          toStatus: 'WON',
          reason: 'Invalid transition',
        });

      expect(response.status).toBe(422);
      const body = response.body;
      expect(body.error).toContain('Business Logic Error');
    });
  });

  describe('GET /tenders/:id/history', () => {
    let tenderId: string;

    beforeEach(async () => {
      const createResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));
      
      tenderId = createResponse.body.data.id;

      // Create some state transitions
      await request
        .post(`/api/v1/tenders/${tenderId}/transition`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          toStatus: 'VALIDATED',
          reason: 'Validated by system',
        });
    });

    it('should return state transition history', async () => {
      const response = await request
        .get(`/api/v1/tenders/${tenderId}/history`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  describe('Authorization Tests', () => {
    it('should require authentication', async () => {
      const response = await request
        .get('/api/v1/tenders');

      expect(response.status).toBe(401);
    });

    it('should require tenant context', async () => {
      const response = await request
        .get('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`);

      expect(response.status).toBe(403);
    });
  });
  // END OF ORIGINAL TESTS

  // ENHANCED INTEGRATION TESTS FOR NEW FEATURES
  describe('Enhanced Tender Features', () => {
    let tenderId: string;

    beforeEach(async () => {
      const createResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));
      
      tenderId = createResponse.body.data.id;
    });

    describe('Per-tender Assignment Authorization', () => {
      let managerUser: any;
      let viewerUser: any;
      let managerToken: string;
      let viewerToken: string;

      beforeEach(async () => {
        const prisma = testServer.getPrisma();
        
        managerUser = await prisma.user.create({
          data: {
            ...createFixture(TEST_FIXTURES.user.manager),
            tenantId: testData.tenant.id,
          },
        });

        viewerUser = await prisma.user.create({
          data: {
            ...createFixture(TEST_FIXTURES.user.viewer),
            tenantId: testData.tenant.id,
          },
        });

        managerToken = server.jwt.sign({
          userId: managerUser.id,
          tenantId: testData.tenant.id,
          role: managerUser.role,
        });

        viewerToken = server.jwt.sign({
          userId: viewerUser.id,
          tenantId: testData.tenant.id,
          role: viewerUser.role,
        });
      });

      it('should allow assignment of tender to specific user', async () => {
        const response = await request
          .post(`/api/v1/tenders/${tenderId}/assign`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            assigneeId: managerUser.id,
            reason: 'Assigning to manager for review',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.assigneeId).toBe(managerUser.id);
      });

      it('should restrict access to assigned tender for non-assignees', async () => {
        // Assign tender to manager
        await request
          .post(`/api/v1/tenders/${tenderId}/assign`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({ assigneeId: managerUser.id });

        // Viewer should not be able to access assigned tender
        const response = await request
          .get(`/api/v1/tenders/${tenderId}`)
          .set('authorization', `Bearer ${viewerToken}`)
          .set('x-tenant-id', testData.tenant.id);

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('assigned');
      });

      it('should allow assignee to access assigned tender', async () => {
        // Assign tender to manager
        await request
          .post(`/api/v1/tenders/${tenderId}/assign`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({ assigneeId: managerUser.id });

        // Manager should be able to access assigned tender
        const response = await request
          .get(`/api/v1/tenders/${tenderId}`)
          .set('authorization', `Bearer ${managerToken}`)
          .set('x-tenant-id', testData.tenant.id);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should allow unassignment by admin', async () => {
        // Assign tender
        await request
          .post(`/api/v1/tenders/${tenderId}/assign`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({ assigneeId: managerUser.id });

        // Unassign tender
        const response = await request
          .post(`/api/v1/tenders/${tenderId}/unassign`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({ reason: 'Reassigning to different team member' });

        expect(response.status).toBe(200);
        expect(response.body.data.assigneeId).toBeNull();
      });
    });

    describe('Single Owner Enforcement', () => {
      let secondTenant: any;
      let secondUser: any;
      let secondToken: string;

      beforeEach(async () => {
        const prisma = testServer.getPrisma();
        
        secondTenant = await prisma.tenant.create({
          data: createFixture({
            ...TEST_FIXTURES.tenant.default,
            subdomain: 'second-tenant',
            name: 'Second Tenant',
          }),
        });

        secondUser = await prisma.user.create({
          data: {
            ...createFixture(TEST_FIXTURES.user.admin),
            email: 'admin@secondtenant.com',
            tenantId: secondTenant.id,
          },
        });

        secondToken = server.jwt.sign({
          userId: secondUser.id,
          tenantId: secondTenant.id,
          role: secondUser.role,
        });
      });

      it('should prevent access to tender from different tenant', async () => {
        const response = await request
          .get(`/api/v1/tenders/${tenderId}`)
          .set('authorization', `Bearer ${secondToken}`)
          .set('x-tenant-id', secondTenant.id);

        expect(response.status).toBe(404); // Should not reveal existence
      });

      it('should prevent modification of tender by different tenant', async () => {
        const response = await request
          .put(`/api/v1/tenders/${tenderId}`)
          .set('authorization', `Bearer ${secondToken}`)
          .set('x-tenant-id', secondTenant.id)
          .send({ title: 'Attempted modification' });

        expect(response.status).toBe(404);
      });
    });

    describe('State Transition Validation', () => {
      it('should validate state transition rules', async () => {
        // Valid transition: SCRAPED -> VALIDATED
        let response = await request
          .post(`/api/v1/tenders/${tenderId}/transition`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            toStatus: 'VALIDATED',
            reason: 'Validation complete',
          });

        expect(response.status).toBe(200);

        // Invalid transition: VALIDATED -> SCRAPED (backward)
        response = await request
          .post(`/api/v1/tenders/${tenderId}/transition`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            toStatus: 'SCRAPED',
            reason: 'Invalid backward transition',
          });

        expect(response.status).toBe(422);
      });

      it('should require reason for state transitions', async () => {
        const response = await request
          .post(`/api/v1/tenders/${tenderId}/transition`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            toStatus: 'VALIDATED',
            // Missing reason
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('reason');
      });

      it('should track state transition audit trail', async () => {
        // Make several transitions
        await request
          .post(`/api/v1/tenders/${tenderId}/transition`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            toStatus: 'VALIDATED',
            reason: 'Initial validation',
          });

        await request
          .post(`/api/v1/tenders/${tenderId}/transition`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            toStatus: 'ASSIGNED',
            reason: 'Assigned for processing',
          });

        // Check history
        const historyResponse = await request
          .get(`/api/v1/tenders/${tenderId}/history`)
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id);

        expect(historyResponse.status).toBe(200);
        const transitions = historyResponse.body.data;
        
        expect(transitions).toHaveLength(2);
        expect(transitions[0].toStatus).toBe('VALIDATED');
        expect(transitions[0].reason).toBe('Initial validation');
        expect(transitions[1].toStatus).toBe('ASSIGNED');
        expect(transitions[1].reason).toBe('Assigned for processing');
      });
    });

    describe('Tender Categories and Filtering', () => {
      beforeEach(async () => {
        // Create tenders with different categories
        await Promise.all([
          request
            .post('/api/v1/tenders')
            .set('authorization', `Bearer ${testData.token}`)
            .set('x-tenant-id', testData.tenant.id)
            .send(createFixture({
              ...TEST_FIXTURES.tender.validated,
              category: 'CONSTRUCTION',
            })),
          request
            .post('/api/v1/tenders')
            .set('authorization', `Bearer ${testData.token}`)
            .set('x-tenant-id', testData.tenant.id)
            .send(createFixture({
              ...TEST_FIXTURES.tender.assigned,
              category: 'LEGAL_SERVICES',
            })),
        ]);
      });

      it('should filter tenders by category', async () => {
        const response = await request
          .get('/api/v1/tenders?category=IT_SERVICES')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id);

        expect(response.status).toBe(200);
        const tenders = response.body.data;
        expect(tenders.every((t: any) => t.category === 'IT_SERVICES')).toBe(true);
      });

      it('should filter by multiple criteria', async () => {
        const response = await request
          .get('/api/v1/tenders?category=CONSTRUCTION&status=VALIDATED')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id);

        expect(response.status).toBe(200);
        const tenders = response.body.data;
        expect(tenders.every((t: any) => 
          t.category === 'CONSTRUCTION' && t.status === 'VALIDATED'
        )).toBe(true);
      });

      it('should sort by deadline', async () => {
        const response = await request
          .get('/api/v1/tenders?sort=deadline&order=asc')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id);

        expect(response.status).toBe(200);
        const tenders = response.body.data;
        
        // Verify sorting
        for (let i = 1; i < tenders.length; i++) {
          const prevDeadline = new Date(tenders[i-1].deadline);
          const currDeadline = new Date(tenders[i].deadline);
          expect(prevDeadline.getTime()).toBeLessThanOrEqual(currDeadline.getTime());
        }
      });
    });

    describe('Bulk Operations', () => {
      let tenderIds: string[];

      beforeEach(async () => {
        // Create multiple test tenders
        const responses = await Promise.all([
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
              ...TEST_FIXTURES.tender.scraped,
              title: 'Second Test Tender',
            })),
        ]);

        tenderIds = responses.map(r => r.body.data.id);
      });

      it('should bulk update tender status', async () => {
        const response = await request
          .post('/api/v1/tenders/bulk/transition')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            tenderIds,
            toStatus: 'VALIDATED',
            reason: 'Bulk validation',
          });

        expect(response.status).toBe(200);
        expect(response.body.data.updated).toBe(tenderIds.length);

        // Verify all tenders were updated
        for (const tenderId of tenderIds) {
          const checkResponse = await request
            .get(`/api/v1/tenders/${tenderId}`)
            .set('authorization', `Bearer ${testData.token}`)
            .set('x-tenant-id', testData.tenant.id);

          expect(checkResponse.body.data.status).toBe('VALIDATED');
        }
      });

      it('should bulk assign tenders', async () => {
        const managerUser = await testServer.getPrisma().user.create({
          data: {
            ...createFixture(TEST_FIXTURES.user.manager),
            tenantId: testData.tenant.id,
          },
        });

        const response = await request
          .post('/api/v1/tenders/bulk/assign')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            tenderIds,
            assigneeId: managerUser.id,
            reason: 'Bulk assignment for review',
          });

        expect(response.status).toBe(200);
        expect(response.body.data.assigned).toBe(tenderIds.length);
      });
    });
  });
});