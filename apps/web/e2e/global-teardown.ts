// Global teardown for Playwright E2E tests
import { chromium, FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up Playwright E2E test environment...');

  // Launch browser for cleanup tasks
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Clean up test data if needed
    console.log('🗑️ Cleaning up test data...');
    await cleanupTestData(page);

    // Logout test user
    console.log('🚪 Logging out test user...');
    await page.goto('/logout');

    console.log('✅ E2E test environment cleaned up!');
  } catch (error) {
    console.warn('⚠️ Non-critical error during E2E cleanup:', error.message);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function cleanupTestData(page: any) {
  try {
    // Navigate to a cleanup endpoint if available
    const baseURL = page.context()._options.baseURL || 'http://localhost:3000';
    await page.goto(`${baseURL}/api/test/cleanup`, { waitUntil: 'networkidle' });
    
    console.log('✅ Test data cleanup completed');
  } catch (error) {
    console.warn('⚠️ Could not clean up test data:', error.message);
  }
}

export default globalTeardown;