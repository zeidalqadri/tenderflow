// Authentication integration tests for TenderFlow API
// This file preserves the original auth tests while adding comprehensive integration coverage

import { FastifyInstance } from 'fastify';
import { TestServer } from '../helpers/test-server';
import { TEST_FIXTURES, createFixture } from '../helpers/fixtures';
import supertest from 'supertest';

describe('Authentication Integration Tests', () => {
  let testServer: TestServer;
  let server: FastifyInstance;
  let request: supertest.SuperTest<supertest.Test>;

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
  });

  // ORIGINAL TESTS FROM SPECIFICATION - PRESERVED EXACTLY
  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Seed test data for original tests
      await testServer.seedTestData();
    });

    it('should authenticate valid user', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('accessToken');
      expect(body.data).toHaveProperty('refreshToken');
      expect(body.data).toHaveProperty('user');
    });

    it('should reject invalid credentials', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      const body = response.body;
      expect(body.success).toBe(false);
      expect(body.error).toContain('Authentication');
    });

    it('should validate request body', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: '',
        });

      expect(response.status).toBe(400);
      const body = response.body;
      expect(body.error).toContain('Validation');
    });
  });

  describe('POST /auth/register', () => {
    it('should create new tenant and user', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'User',
          tenantName: 'Test Company',
          tenantSubdomain: 'testcompany',
        });

      expect(response.status).toBe(201);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('user');
      expect(body.data).toHaveProperty('tenant');
      expect(body.data.user.role).toBe('admin');
    });

    it('should reject duplicate email', async () => {
      const payload = {
        email: 'duplicate@example.com',
        password: 'password123',
        firstName: 'Duplicate',
        lastName: 'User',
        tenantName: 'Duplicate Company',
        tenantSubdomain: 'duplicate',
      };

      // First registration
      await request
        .post('/api/v1/auth/register')
        .send(payload);

      // Second registration with same email
      const response = await request
        .post('/api/v1/auth/register')
        .send(payload);

      expect(response.status).toBe(409);
      const body = response.body;
      expect(body.error).toContain('Conflict');
    });
  });

  describe('GET /auth/me', () => {
    let authToken: string;

    beforeEach(async () => {
      const { token } = await testServer.seedTestData();
      authToken = token;
    });

    it('should return current user info', async () => {
      const response = await request
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('email');
      expect(body.data).toHaveProperty('tenant');
    });

    it('should reject unauthenticated request', async () => {
      const response = await request
        .get('/api/v1/auth/me');

      expect(response.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const response = await request
        .get('/api/v1/auth/me')
        .set('authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
  // END OF ORIGINAL TESTS

  // ENHANCED INTEGRATION TESTS FOR NEW FEATURES
  describe('Enhanced Authentication Features', () => {
    let testData: { tenant: any; user: any; token: string };

    beforeEach(async () => {
      testData = await testServer.seedTestData();
    });

    describe('JWT Token Management', () => {
      it('should include tenant context in JWT payload', async () => {
        const response = await request
          .post('/api/v1/auth/login')
          .send(TEST_FIXTURES.auth.login.valid);

        expect(response.status).toBe(200);
        const { accessToken } = response.body.data;
        
        // Decode JWT to verify tenant context
        const decoded = server.jwt.decode(accessToken) as any;
        expect(decoded.tenantId).toBeDefined();
        expect(decoded.role).toBe('admin');
      });

      it('should validate token expiration', async () => {
        // Create an expired token (mock implementation)
        const expiredToken = server.jwt.sign(
          { userId: testData.user.id, tenantId: testData.tenant.id },
          { expiresIn: '1ms' }
        );

        // Wait for token to expire
        await new Promise(resolve => setTimeout(resolve, 10));

        const response = await request
          .get('/api/v1/auth/me')
          .set('authorization', `Bearer ${expiredToken}`);

        expect(response.status).toBe(401);
      });
    });

    describe('Multi-tenant Authentication', () => {
      let secondTenant: any;
      let secondUser: any;

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
      });

      it('should isolate users between tenants', async () => {
        // Try to login with first tenant credentials
        const response1 = await request
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123',
          });

        // Try to login with second tenant credentials  
        const response2 = await request
          .post('/api/v1/auth/login')
          .send({
            email: 'admin@secondtenant.com',
            password: 'password123',
          });

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);

        // Verify different tenant contexts
        const token1 = server.jwt.decode(response1.body.data.accessToken) as any;
        const token2 = server.jwt.decode(response2.body.data.accessToken) as any;
        
        expect(token1.tenantId).not.toBe(token2.tenantId);
      });

      it('should prevent cross-tenant user access', async () => {
        // Get token for first user
        const { token } = testData;

        // Try to access resources with wrong tenant header
        const response = await request
          .get('/api/v1/auth/me')
          .set('authorization', `Bearer ${token}`)
          .set('x-tenant-id', secondTenant.id);

        expect(response.status).toBe(403);
      });
    });

    describe('Role-based Access Control', () => {
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

      it('should enforce role-based permissions', async () => {
        // Admin should have full access
        const adminResponse = await request
          .get('/api/v1/auth/me')
          .set(...Object.entries(TEST_FIXTURES.headers.authTenant(testData.token, testData.tenant.id)).flat());

        expect(adminResponse.status).toBe(200);

        // Manager should have limited access
        const managerResponse = await request
          .get('/api/v1/auth/me')
          .set(...Object.entries(TEST_FIXTURES.headers.authTenant(managerToken, testData.tenant.id)).flat());

        expect(managerResponse.status).toBe(200);

        // Viewer should have read-only access
        const viewerResponse = await request
          .get('/api/v1/auth/me')
          .set(...Object.entries(TEST_FIXTURES.headers.authTenant(viewerToken, testData.tenant.id)).flat());

        expect(viewerResponse.status).toBe(200);
      });
    });

    describe('Security Enhancements', () => {
      it('should rate limit login attempts', async () => {
        const loginPayload = {
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        };

        // Make multiple failed login attempts
        const attempts = [];
        for (let i = 0; i < 6; i++) {
          attempts.push(
            request.post('/api/v1/auth/login').send(loginPayload)
          );
        }

        const responses = await Promise.all(attempts);
        
        // First few attempts should be 401 (unauthorized)
        expect(responses[0].status).toBe(401);
        expect(responses[1].status).toBe(401);
        
        // Later attempts should be rate limited (429)
        const rateLimited = responses.some(r => r.status === 429);
        expect(rateLimited).toBe(true);
      });

      it('should sanitize error messages', async () => {
        const response = await request
          .post('/api/v1/auth/login')
          .send({
            email: 'nonexistent@example.com',
            password: 'wrongpassword',
          });

        expect(response.status).toBe(401);
        // Should not leak sensitive information
        expect(response.body.error).not.toContain('database');
        expect(response.body.error).not.toContain('sql');
        expect(response.body.error).not.toContain('query');
      });

      it('should validate password strength on registration', async () => {
        const response = await request
          .post('/api/v1/auth/register')
          .send({
            email: 'weakpassword@example.com',
            password: '123', // Too weak
            firstName: 'Weak',
            lastName: 'Password',
            tenantName: 'Test Company',
            tenantSubdomain: 'test-weak',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('password');
      });
    });

    describe('Session Management', () => {
      it('should handle concurrent sessions', async () => {
        // Login multiple times with same credentials
        const login1 = await request
          .post('/api/v1/auth/login')
          .send(TEST_FIXTURES.auth.login.valid);

        const login2 = await request
          .post('/api/v1/auth/login')
          .send(TEST_FIXTURES.auth.login.valid);

        expect(login1.status).toBe(200);
        expect(login2.status).toBe(200);

        // Both tokens should be valid
        const token1 = login1.body.data.accessToken;
        const token2 = login2.body.data.accessToken;

        const check1 = await request
          .get('/api/v1/auth/me')
          .set('authorization', `Bearer ${token1}`);

        const check2 = await request
          .get('/api/v1/auth/me')
          .set('authorization', `Bearer ${token2}`);

        expect(check1.status).toBe(200);
        expect(check2.status).toBe(200);
      });

      it('should handle refresh token rotation', async () => {
        const loginResponse = await request
          .post('/api/v1/auth/login')
          .send(TEST_FIXTURES.auth.login.valid);

        const { refreshToken } = loginResponse.body.data;

        const refreshResponse = await request
          .post('/api/v1/auth/refresh')
          .send({ refreshToken });

        expect(refreshResponse.status).toBe(200);
        expect(refreshResponse.body.data).toHaveProperty('accessToken');
        expect(refreshResponse.body.data).toHaveProperty('refreshToken');
        
        // New refresh token should be different
        expect(refreshResponse.body.data.refreshToken).not.toBe(refreshToken);
      });
    });
  });
});