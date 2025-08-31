// Authentication E2E tests for TenderFlow
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.describe('User Registration', () => {
    test('should register a new user successfully', async ({ page }) => {
      await page.goto('/register');

      // Fill registration form
      await page.fill('[data-testid="email-input"]', 'newuser@example.com');
      await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="first-name-input"]', 'New');
      await page.fill('[data-testid="last-name-input"]', 'User');
      await page.fill('[data-testid="tenant-name-input"]', 'New Company');
      await page.fill('[data-testid="tenant-subdomain-input"]', 'new-company');

      // Submit form
      await page.click('[data-testid="register-button"]');

      // Verify successful registration
      await expect(page.locator('[data-testid="registration-success"]')).toBeVisible();
      await expect(page).toHaveURL('/dashboard');

      // Verify user is authenticated
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-name"]')).toContainText('New User');
    });

    test('should show validation errors for invalid data', async ({ page }) => {
      await page.goto('/register');

      // Try to submit with invalid email
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.fill('[data-testid="password-input"]', '123');
      await page.click('[data-testid="register-button"]');

      // Should show validation errors
      await expect(page.locator('[data-testid="email-error"]')).toContainText('Invalid email');
      await expect(page.locator('[data-testid="password-error"]')).toContainText('Password too short');
    });

    test('should show error for duplicate email', async ({ page }) => {
      await page.goto('/register');

      // Use the same email as setup user
      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="first-name-input"]', 'Duplicate');
      await page.fill('[data-testid="last-name-input"]', 'User');
      await page.fill('[data-testid="tenant-name-input"]', 'Duplicate Company');
      await page.fill('[data-testid="tenant-subdomain-input"]', 'duplicate-company');

      await page.click('[data-testid="register-button"]');

      // Should show duplicate email error
      await expect(page.locator('[data-testid="registration-error"]')).toContainText('Email already exists');
    });
  });

  test.describe('User Login', () => {
    test('should login with valid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page.click('[data-testid="login-button"]');

      // Should redirect to dashboard
      await expect(page).toHaveURL('/dashboard');
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'wrong-password');
      await page.click('[data-testid="login-button"]');

      await expect(page.locator('[data-testid="login-error"]')).toContainText('Invalid credentials');
      await expect(page).toHaveURL('/login');
    });

    test('should redirect to intended page after login', async ({ page }) => {
      // Try to access protected page while logged out
      await page.goto('/tenders');
      
      // Should redirect to login
      await expect(page).toHaveURL('/login');
      
      // Login
      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page.click('[data-testid="login-button"]');

      // Should redirect back to intended page
      await expect(page).toHaveURL('/tenders');
    });

    test('should remember me functionality', async ({ page }) => {
      await page.goto('/login');

      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page.check('[data-testid="remember-me-checkbox"]');
      await page.click('[data-testid="login-button"]');

      await expect(page).toHaveURL('/dashboard');

      // Close and reopen browser context to simulate browser restart
      const context = page.context();
      await context.close();
      
      const newContext = await context.browser()?.newContext();
      const newPage = await newContext?.newPage();
      
      if (newPage) {
        await newPage.goto('/dashboard');
        // Should still be logged in due to remember me
        await expect(newPage.locator('[data-testid="user-menu"]')).toBeVisible();
        await newContext?.close();
      }
    });
  });

  test.describe('User Logout', () => {
    test('should logout successfully', async ({ page }) => {
      // First login
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page.click('[data-testid="login-button"]');

      await expect(page).toHaveURL('/dashboard');

      // Logout
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');

      // Should redirect to login page
      await expect(page).toHaveURL('/login');
      await expect(page.locator('[data-testid="user-menu"]')).not.toBeVisible();
    });

    test('should clear session data on logout', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page.click('[data-testid="login-button"]');

      // Logout
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');

      // Try to access protected page
      await page.goto('/dashboard');
      
      // Should redirect to login
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Password Reset', () => {
    test('should send password reset email', async ({ page }) => {
      await page.goto('/forgot-password');

      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.click('[data-testid="send-reset-button"]');

      await expect(page.locator('[data-testid="reset-email-sent"]')).toContainText(
        'Password reset email sent'
      );
    });

    test('should show error for non-existent email', async ({ page }) => {
      await page.goto('/forgot-password');

      await page.fill('[data-testid="email-input"]', 'nonexistent@example.com');
      await page.click('[data-testid="send-reset-button"]');

      await expect(page.locator('[data-testid="reset-error"]')).toContainText(
        'Email not found'
      );
    });
  });

  test.describe('Session Management', () => {
    test('should handle session expiration', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page.click('[data-testid="login-button"]');

      await expect(page).toHaveURL('/dashboard');

      // Mock session expiration by clearing localStorage
      await page.evaluate(() => {
        localStorage.removeItem('auth-token');
        sessionStorage.clear();
      });

      // Try to make an authenticated request
      await page.click('[data-testid="tenders-nav"]');

      // Should be redirected to login
      await expect(page).toHaveURL('/login');
      await expect(page.locator('[data-testid="session-expired-message"]')).toContainText(
        'Session expired'
      );
    });

    test('should handle concurrent sessions', async ({ browser }) => {
      // Create two browser contexts to simulate different sessions
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Login in first session
      await page1.goto('/login');
      await page1.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page1.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page1.click('[data-testid="login-button"]');

      // Login in second session
      await page2.goto('/login');
      await page2.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page2.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page2.click('[data-testid="login-button"]');

      // Both sessions should be valid
      await expect(page1.locator('[data-testid="user-menu"]')).toBeVisible();
      await expect(page2.locator('[data-testid="user-menu"]')).toBeVisible();

      await context1.close();
      await context2.close();
    });
  });

  test.describe('Authentication UI/UX', () => {
    test('should show loading states', async ({ page }) => {
      await page.goto('/login');

      // Mock slow network to see loading state
      await page.route('**/api/v1/auth/login', (route) => {
        setTimeout(() => route.continue(), 2000);
      });

      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page.click('[data-testid="login-button"]');

      // Should show loading spinner
      await expect(page.locator('[data-testid="login-loading"]')).toBeVisible();
      
      // Button should be disabled during loading
      await expect(page.locator('[data-testid="login-button"]')).toBeDisabled();
    });

    test('should be keyboard accessible', async ({ page }) => {
      await page.goto('/login');

      // Navigate form using Tab key
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="email-input"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="password-input"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="remember-me-checkbox"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="login-button"]')).toBeFocused();

      // Should be able to submit with Enter
      await page.fill('[data-testid="email-input"]', 'e2e-test@example.com');
      await page.fill('[data-testid="password-input"]', 'e2e-test-password');
      await page.keyboard.press('Enter');

      await expect(page).toHaveURL('/dashboard');
    });

    test('should be responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      await page.goto('/login');

      // Form should be readable and usable on mobile
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
      
      // Elements should be properly sized
      const emailInput = page.locator('[data-testid="email-input"]');
      await expect(emailInput).toBeVisible();
      
      const boundingBox = await emailInput.boundingBox();
      expect(boundingBox?.width).toBeGreaterThan(250); // Should be wide enough for mobile
    });
  });
});