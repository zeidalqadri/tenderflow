// Tender routes tests for TenderFlow API
import { FastifyInstance } from 'fastify';
import { createServer } from '../server';

describe('Tender Routes', () => {
  let server: FastifyInstance;
  let authToken: string;
  let tenderId: string;

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

    // Authenticate to get token
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

  afterAll(async () => {
    await server.close();
  });

  describe('POST /tenders', () => {
    it('should create new tender', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/tenders',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
        payload: {
          title: 'Test Tender',
          description: 'A test tender description',
          category: 'IT_SERVICES',
          deadline: '2024-12-31T23:59:59.000Z',
          estimatedValue: 100000,
          currency: 'USD',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data.title).toBe('Test Tender');
      expect(body.data.status).toBe('SCRAPED');
      
      tenderId = body.data.id;
    });

    it('should validate required fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/tenders',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
        payload: {
          description: 'Missing title',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Validation');
    });
  });

  describe('GET /tenders', () => {
    it('should return paginated tenders', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/tenders?page=1&limit=10',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.pagination).toHaveProperty('page');
      expect(body.pagination).toHaveProperty('totalPages');
    });

    it('should filter by status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/tenders?status=SCRAPED',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /tenders/:id', () => {
    it('should return tender by ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/tenders/${tenderId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(tenderId);
    });

    it('should return 404 for non-existent tender', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/tenders/00000000-0000-0000-0000-000000000000',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /tenders/:id', () => {
    it('should update tender', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/api/v1/tenders/${tenderId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
        payload: {
          title: 'Updated Test Tender',
          estimatedValue: 150000,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.title).toBe('Updated Test Tender');
      expect(body.data.estimatedValue).toBe(150000);
    });
  });

  describe('POST /tenders/:id/transition', () => {
    it('should transition tender state', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tenderId}/transition`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
        payload: {
          toStatus: 'VALIDATED',
          reason: 'Tender has been validated',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('VALIDATED');
    });

    it('should reject invalid state transition', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tenderId}/transition`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
        payload: {
          toStatus: 'WON',
          reason: 'Invalid transition',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Business Logic Error');
    });
  });

  describe('GET /tenders/:id/history', () => {
    it('should return state transition history', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/tenders/${tenderId}/history`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-tenant-id': 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  describe('Authorization Tests', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/tenders',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should require tenant context', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/tenders',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});