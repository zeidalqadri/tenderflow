// Global setup for Playwright E2E tests
import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🎭 Setting up Playwright E2E test environment...');

  // Launch browser for setup tasks
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for the application to be ready
    console.log('⏳ Waiting for application to be ready...');
    await page.goto(config.use?.baseURL || 'http://localhost:3000');
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 30000 });

    // Create test user if needed
    console.log('👤 Setting up test user...');
    await setupTestUser(page);

    // Warm up the application
    console.log('🔥 Warming up application...');
    await warmupApplication(page);

    console.log('✅ Playwright E2E test environment ready!');
  } catch (error) {
    console.error('❌ Failed to set up E2E test environment:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function setupTestUser(page: any) {
  // Check if test user already exists by trying to login
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
  await page.fill('[data-testid="password-input"]', 'e2e-test-password');
  await page.click('[data-testid="login-button"]');

  // If login fails, create the test user
  if (await page.locator('[data-testid="login-error"]').isVisible()) {
    console.log('📝 Creating E2E test user...');
    
    await page.goto('/register');
    await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
    await page.fill('[data-testid="password-input"]', 'e2e-test-password');
    await page.fill('[data-testid="confirm-password-input"]', 'e2e-test-password');
    await page.fill('[data-testid="first-name-input"]', 'E2E');
    await page.fill('[data-testid="last-name-input"]', 'Test');
    await page.fill('[data-testid="tenant-name-input"]', 'E2E Test Company');
    await page.fill('[data-testid="tenant-subdomain-input"]', 'e2e-test');
    
    await page.click('[data-testid="register-button"]');
    
    // Wait for registration success
    await page.waitForSelector('[data-testid="registration-success"]', { timeout: 10000 });
  }

  // Ensure we're logged in for subsequent tests
  if (await page.locator('[data-testid="user-menu"]').isVisible()) {
    console.log('✅ Test user ready and authenticated');
  } else {
    throw new Error('Failed to authenticate test user');
  }
}

async function warmupApplication(page: any) {
  // Navigate to main sections to warm up the app
  const routes = [
    '/dashboard',
    '/tenders',
    '/documents',
    '/inbox',
  ];

  for (const route of routes) {
    try {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      console.log(`✅ Warmed up route: ${route}`);
    } catch (error) {
      console.warn(`⚠️  Could not warm up route ${route}:`, error.message);
    }
  }
}

export default globalSetup;