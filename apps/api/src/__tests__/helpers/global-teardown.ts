// Global test teardown for TenderFlow API tests

export default async function globalTeardown(): Promise<void> {
  console.log('🧹 Cleaning up global test environment...');

  try {
    const containers = (global as any).testContainers;
    
    if (containers?.postgres) {
      console.log('🛑 Stopping PostgreSQL test container...');
      await containers.postgres.stop();
    }

    if (containers?.redis) {
      console.log('🛑 Stopping Redis test container...');
      await containers.redis.stop();
    }

    console.log('✅ Global test environment cleaned up!');
  } catch (error) {
    console.error('❌ Error during global teardown:', error);
  }
}