// Global test setup for TenderFlow API tests
import { GenericContainer, StartedTestContainer } from 'testcontainers';

let postgresContainer: StartedTestContainer;
let redisContainer: StartedTestContainer;

export default async function globalSetup(): Promise<void> {
  console.log('🚀 Setting up global test environment...');

  try {
    // Start PostgreSQL test container
    console.log('📦 Starting PostgreSQL test container...');
    postgresContainer = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({
        POSTGRES_DB: 'tenderflow_test',
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
        POSTGRES_HOST_AUTH_METHOD: 'trust',
      })
      .withExposedPorts(5432)
      .withHealthCheck({
        test: ['CMD-SHELL', 'pg_isready -U test_user -d tenderflow_test'],
        interval: 1000,
        timeout: 3000,
        retries: 30,
      })
      .withWaitStrategy('health')
      .start();

    // Start Redis test container
    console.log('📦 Starting Redis test container...');
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withHealthCheck({
        test: ['CMD', 'redis-cli', 'ping'],
        interval: 1000,
        timeout: 3000,
        retries: 10,
      })
      .withWaitStrategy('health')
      .start();

    // Set environment variables for test containers
    const postgresPort = postgresContainer.getMappedPort(5432);
    const redisPort = redisContainer.getMappedPort(6379);
    
    process.env.TEST_DATABASE_URL = `postgresql://test_user:test_password@localhost:${postgresPort}/tenderflow_test`;
    process.env.TEST_REDIS_URL = `redis://localhost:${redisPort}`;
    
    // Store container references for cleanup
    (global as any).testContainers = {
      postgres: postgresContainer,
      redis: redisContainer,
    };

    console.log('✅ Global test environment ready!');
    console.log(`  - PostgreSQL: localhost:${postgresPort}`);
    console.log(`  - Redis: localhost:${redisPort}`);

  } catch (error) {
    console.error('❌ Failed to set up global test environment:', error);
    throw error;
  }
}

// Handle cleanup on process exit
process.on('SIGTERM', async () => {
  const containers = (global as any).testContainers;
  if (containers) {
    await containers.postgres?.stop();
    await containers.redis?.stop();
  }
});