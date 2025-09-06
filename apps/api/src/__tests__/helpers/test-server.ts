// Test server factory for TenderFlow API tests
import { FastifyInstance } from 'fastify';
import { createServer } from '../../server';
import { PrismaClient } from '../../generated/prisma';

export interface TestServerConfig {
  isolateDatabase?: boolean;
  skipAuth?: boolean;
  mockExternalServices?: boolean;
}

export class TestServer {
  private server?: FastifyInstance;
  private prisma?: PrismaClient;

  async create(config: TestServerConfig = {}): Promise<FastifyInstance> {
    const testConfig = {
      port: 0,
      host: 'localhost',
      nodeEnv: 'test' as const,
      logLevel: 'silent' as const,
      corsOrigin: true,
      jwtSecret: 'test-jwt-secret-key-for-testing-only',
      databaseUrl: process.env.TEST_DATABASE_URL || 'postgresql://test_user:test_password@localhost:5433/tenderflow_test',
      redisUrl: process.env.TEST_REDIS_URL || 'redis://localhost:6380',
      s3Bucket: 'test-bucket',
      s3Region: 'us-east-1',
      s3AccessKeyId: 'test',
      s3SecretAccessKey: 'test',
      awsEndpointUrl: 'http://localhost:4566', // LocalStack endpoint
      smtpHost: 'localhost',
      smtpPort: 1025,
      smtpSecure: false,
      smtpUser: '',
      smtpPassword: '',
    };

    this.server = await createServer(testConfig);

    // Initialize Prisma client for test database operations
    this.prisma = new PrismaClient({
      datasource: {
        url: testConfig.databaseUrl,
      },
    });

    return this.server;
  }

  async cleanup(): Promise<void> {
    if (this.server) {
      await this.server.close();
    }
    
    if (this.prisma) {
      await this.prisma.$disconnect();
    }
  }

  async resetDatabase(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    // Clean up test data in reverse dependency order
    await this.prisma.auditLog.deleteMany();
    await this.prisma.stateTransition.deleteMany();
    await this.prisma.document.deleteMany();
    await this.prisma.submission.deleteMany();
    await this.prisma.tender.deleteMany();
    await this.prisma.user.deleteMany();
    await this.prisma.tenant.deleteMany();
  }

  async seedTestData(): Promise<{
    tenant: any;
    user: any;
    token: string;
  }> {
    if (!this.prisma || !this.server) {
      throw new Error('Test server not properly initialized');
    }

    // Create test tenant
    const tenant = await this.prisma.tenant.create({
      data: {
        name: 'Test Company',
        subdomain: 'test-company',
        settings: {},
        isActive: true,
      },
    });

    // Create test user
    const user = await this.prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: '$2b$10$8K1p/a0dURXAm7QisSp5.eQKm2K5J2K5J2K5J2K5J2K5J2K5J2', // 'password123'
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
        isActive: true,
        tenantId: tenant.id,
      },
    });

    // Generate JWT token
    const token = this.server.jwt.sign({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
    });

    return { tenant, user, token };
  }

  getPrisma(): PrismaClient {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }
    return this.prisma;
  }
}

export function createTestServer(config?: TestServerConfig): TestServer {
  return new TestServer();
}