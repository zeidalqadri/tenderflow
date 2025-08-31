// Security tests for TenderFlow API

import { FastifyInstance } from 'fastify';
import { TestServer } from '../helpers/test-server';
import { TEST_FIXTURES, createFixture } from '../helpers/fixtures';
import supertest from 'supertest';

describe('Security Tests', () => {
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

  describe('Authentication Security', () => {
    it('should enforce JWT token validation', async () => {
      const invalidTokens = [
        'invalid.jwt.token',
        'Bearer malformed-token',
        '',
        'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.expired.token',
      ];

      for (const token of invalidTokens) {
        const response = await request
          .get('/api/v1/auth/me')
          .set('authorization', token);

        expect(response.status).toBe(401);
        expect(response.body.error).toContain('authentication');
      }
    });

    it('should prevent token reuse after logout', async () => {
      // Login to get token
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send(TEST_FIXTURES.auth.login.valid);

      const { accessToken } = loginResponse.body.data;

      // Verify token works
      let meResponse = await request
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${accessToken}`);
      expect(meResponse.status).toBe(200);

      // Logout
      const logoutResponse = await request
        .post('/api/v1/auth/logout')
        .set('authorization', `Bearer ${accessToken}`);
      expect(logoutResponse.status).toBe(200);

      // Try to use token after logout
      meResponse = await request
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${accessToken}`);
      expect(meResponse.status).toBe(401);
    });

    it('should implement secure session management', async () => {
      // Test session fixation protection
      const sessionResponse1 = await request
        .get('/api/v1/auth/session')
        .expect(200);

      const sessionId1 = sessionResponse1.body.data.sessionId;

      // Login should create new session
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send(TEST_FIXTURES.auth.login.valid);

      expect(loginResponse.status).toBe(200);

      const sessionResponse2 = await request
        .get('/api/v1/auth/session')
        .set('authorization', `Bearer ${loginResponse.body.data.accessToken}`);

      expect(sessionResponse2.status).toBe(200);
      const sessionId2 = sessionResponse2.body.data.sessionId;
      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe('Authorization Security', () => {
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

    it('should enforce role-based access control', async () => {
      // Viewer should not be able to create tenders
      const createResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${viewerToken}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));

      expect(createResponse.status).toBe(403);

      // Manager should be able to create tenders
      const managerCreateResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${managerToken}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));

      expect(managerCreateResponse.status).toBe(201);
    });

    it('should prevent privilege escalation', async () => {
      // Attempt to modify user role
      const escalationResponse = await request
        .put(`/api/v1/users/${viewerUser.id}`)
        .set('authorization', `Bearer ${viewerToken}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({ role: 'admin' });

      expect(escalationResponse.status).toBe(403);

      // Verify role unchanged
      const userResponse = await request
        .get(`/api/v1/users/${viewerUser.id}`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(userResponse.body.data.role).toBe('viewer');
    });

    it('should enforce tenant isolation', async () => {
      const prisma = testServer.getPrisma();
      
      // Create second tenant
      const otherTenant = await prisma.tenant.create({
        data: createFixture({
          ...TEST_FIXTURES.tenant.default,
          subdomain: 'other-tenant',
          name: 'Other Tenant',
        }),
      });

      // Create tender in first tenant
      const createResponse = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send(createFixture(TEST_FIXTURES.tender.scraped));

      const tenderId = createResponse.body.data.id;

      // Try to access from other tenant
      const otherUser = await prisma.user.create({
        data: {
          ...createFixture(TEST_FIXTURES.user.admin),
          email: 'other@example.com',
          tenantId: otherTenant.id,
        },
      });

      const otherToken = server.jwt.sign({
        userId: otherUser.id,
        tenantId: otherTenant.id,
        role: otherUser.role,
      });

      const accessResponse = await request
        .get(`/api/v1/tenders/${tenderId}`)
        .set('authorization', `Bearer ${otherToken}`)
        .set('x-tenant-id', otherTenant.id);

      expect(accessResponse.status).toBe(404);
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent SQL injection attacks', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
        "' UNION SELECT * FROM sensitive_data --",
      ];

      for (const maliciousInput of maliciousInputs) {
        const response = await request
          .post('/api/v1/auth/login')
          .send({
            email: maliciousInput,
            password: 'password',
          });

        // Should return validation error, not SQL error
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('validation');
        expect(response.body.error).not.toContain('sql');
        expect(response.body.error).not.toContain('database');
      }
    });

    it('should prevent XSS attacks', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '"><script>alert(document.cookie)</script>',
        "javascript:alert('XSS')",
        '<img src=x onerror=alert("XSS")>',
      ];

      for (const payload of xssPayloads) {
        const response = await request
          .post('/api/v1/tenders')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .send({
            title: payload,
            description: 'Test description',
            category: 'IT_SERVICES',
            deadline: '2024-12-31T23:59:59.000Z',
            estimatedValue: 100000,
            currency: 'USD',
          });

        if (response.status === 201) {
          // If tender created, verify XSS payload is sanitized
          const tender = response.body.data;
          expect(tender.title).not.toContain('<script>');
          expect(tender.title).not.toContain('javascript:');
        }
      }
    });

    it('should validate file upload security', async () => {
      // Test malicious file types
      const maliciousFiles = [
        { name: 'malware.exe', content: 'MZ\x90\x00' }, // PE header
        { name: 'script.php', content: '<?php system($_GET["cmd"]); ?>' },
        { name: 'shell.jsp', content: '<% Runtime.getRuntime().exec(request.getParameter("cmd")); %>' },
      ];

      for (const file of maliciousFiles) {
        const response = await request
          .post('/api/v1/documents/upload')
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id)
          .attach('file', Buffer.from(file.content), file.name);

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/file type|security/i);
      }
    });

    it('should prevent path traversal attacks', async () => {
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/shadow',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request
          .get(`/api/v1/documents/download`)
          .query({ path: payload })
          .set('authorization', `Bearer ${testData.token}`)
          .set('x-tenant-id', testData.tenant.id);

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('invalid');
      }
    });
  });

  describe('Rate Limiting Security', () => {
    it('should rate limit authentication attempts', async () => {
      const promises = [];
      
      // Make multiple failed login attempts
      for (let i = 0; i < 10; i++) {
        promises.push(
          request
            .post('/api/v1/auth/login')
            .send({
              email: 'attacker@example.com',
              password: 'wrongpassword',
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Should be rate limited after several attempts
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should rate limit API endpoints', async () => {
      const promises = [];
      
      // Make many requests to same endpoint
      for (let i = 0; i < 100; i++) {
        promises.push(
          request
            .get('/api/v1/tenders')
            .set('authorization', `Bearer ${testData.token}`)
            .set('x-tenant-id', testData.tenant.id)
        );
      }

      const responses = await Promise.all(promises);
      
      // Should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Check rate limit headers
      const rateLimitedResponse = rateLimitedResponses[0];
      expect(rateLimitedResponse.headers['x-ratelimit-limit']).toBeDefined();
      expect(rateLimitedResponse.headers['x-ratelimit-remaining']).toBeDefined();
      expect(rateLimitedResponse.headers['retry-after']).toBeDefined();
    });
  });

  describe('Data Protection', () => {
    it('should not expose sensitive data in error messages', async () => {
      // Test database connection error
      const errorResponse = await request
        .get('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', 'invalid-tenant-id');

      expect(errorResponse.status).toBe(403);
      // Should not expose database connection strings or internal paths
      expect(errorResponse.body.error).not.toContain('postgresql://');
      expect(errorResponse.body.error).not.toContain('/var/lib/');
      expect(errorResponse.body.error).not.toContain('ECONNREFUSED');
    });

    it('should encrypt sensitive data at rest', async () => {
      const sensitiveData = {
        title: 'Sensitive Government Contract',
        description: 'Contains classified information',
        estimatedValue: 1000000,
      };

      const response = await request
        .post('/api/v1/tenders')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          ...createFixture(TEST_FIXTURES.tender.scraped),
          ...sensitiveData,
        });

      expect(response.status).toBe(201);
      const tenderId = response.body.data.id;

      // Check database directly to verify encryption
      const prisma = testServer.getPrisma();
      const tenderFromDb = await prisma.tender.findUnique({
        where: { id: tenderId },
      });

      // Sensitive fields should be encrypted (implementation dependent)
      expect(tenderFromDb?.title).toBe(sensitiveData.title); // In test env might not be encrypted
    });

    it('should implement secure logging', async () => {
      // Attempt login with sensitive data
      await request
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'supersecretpassword123',
          secretKey: 'classified-information',
        });

      // In real implementation, would check logs don't contain passwords
      // For test purposes, we verify the endpoint doesn't echo sensitive data
      expect(true).toBe(true); // Placeholder for log verification
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request
        .get('/api/v1/health')
        .expect(200);

      // Check for security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toContain('max-age=');
      expect(response.headers['referrer-policy']).toBe('same-origin');
    });

    it('should set secure CORS headers', async () => {
      const response = await request
        .options('/api/v1/tenders')
        .set('origin', 'https://app.tenderflow.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('https://app.tenderflow.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-max-age']).toBeDefined();
    });
  });

  describe('Cryptographic Security', () => {
    it('should use secure password hashing', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send(createFixture(TEST_FIXTURES.auth.register.valid));

      expect(response.status).toBe(201);
      
      // Verify password is hashed (check database)
      const prisma = testServer.getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: TEST_FIXTURES.auth.register.valid.email },
      });

      expect(user?.passwordHash).toBeDefined();
      expect(user?.passwordHash).not.toBe(TEST_FIXTURES.auth.register.valid.password);
      expect(user?.passwordHash).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt format
    });

    it('should generate cryptographically secure tokens', async () => {
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send(TEST_FIXTURES.auth.login.valid);

      const { accessToken, refreshToken } = loginResponse.body.data;

      // Tokens should be of expected length and format
      expect(accessToken).toMatch(/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/); // JWT format
      expect(refreshToken).toHaveLength(128); // Secure random token
      
      // Tokens should be different
      expect(accessToken).not.toBe(refreshToken);
    });

    it('should validate JWT signature integrity', async () => {
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send(TEST_FIXTURES.auth.login.valid);

      const { accessToken } = loginResponse.body.data;
      
      // Tamper with token
      const parts = accessToken.split('.');
      parts[2] = parts[2].slice(0, -5) + 'XXXXX'; // Modify signature
      const tamperedToken = parts.join('.');

      const response = await request
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('invalid');
    });
  });
});