// Authentication route tests for TenderFlow API
import { FastifyInstance } from 'fastify';
import { createServer } from '../server';

describe('Authentication Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    const config = {
      port: 0,
      host: 'localhost',
      nodeEnv: 'test' as const,
      logLevel: 'silent' as const,
      corsOrigin: true,
      jwtSecret: 'test-secret',
      databaseUrl: 'postgresql://test:test@localhost:5432/test',
      redisUrl: 'redis://localhost:6379/1',
      s3Bucket: 'test-bucket',
      s3Region: 'us-east-1',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
    };

    server = await createServer(config);
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /auth/login', () => {
    it('should authenticate valid user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('accessToken');
      expect(body.data).toHaveProperty('refreshToken');
      expect(body.data).toHaveProperty('user');
    });

    it('should reject invalid credentials', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Authentication');
    });

    it('should validate request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'invalid-email',
          password: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Validation');
    });
  });

  describe('POST /auth/register', () => {
    it('should create new tenant and user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'User',
          tenantName: 'Test Company',
          tenantSubdomain: 'testcompany',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
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
      await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload,
      });

      // Second registration with same email
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload,
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Conflict');
    });
  });

  describe('GET /auth/me', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      authToken = loginBody.data.accessToken;
    });

    it('should return current user info', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('email');
      expect(body.data).toHaveProperty('tenant');
    });

    it('should reject unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});