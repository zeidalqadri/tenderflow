# TenderFlow Testing Framework Guide

This document provides comprehensive guidance on the TenderFlow testing framework, including setup, execution, and best practices.

## Table of Contents

1. [Overview](#overview)
2. [Test Types](#test-types)
3. [Setup and Configuration](#setup-and-configuration)
4. [Running Tests](#running-tests)
5. [Writing Tests](#writing-tests)
6. [CI/CD Integration](#cicd-integration)
7. [Quality Gates](#quality-gates)
8. [Troubleshooting](#troubleshooting)

## Overview

The TenderFlow testing framework provides comprehensive coverage across all application layers:

- **Unit Tests**: Test individual components and functions
- **Integration Tests**: Test interactions between components
- **End-to-End Tests**: Test complete user workflows
- **Security Tests**: Test for security vulnerabilities
- **Performance Tests**: Test application performance and resource usage

### Technology Stack

- **Jest**: Unit and integration testing framework
- **React Testing Library**: React component testing
- **Playwright**: End-to-end testing
- **Supertest**: API testing
- **MSW**: API mocking for frontend tests
- **Testcontainers**: Database testing with Docker

## Test Types

### Unit Tests

Located in `src/__tests__/unit/` directories within each package.

**Purpose**: Test individual functions, methods, and components in isolation.

**Coverage Requirements**:
- API routes: 90% minimum
- Business logic: 85% minimum
- UI components: 80% minimum
- Utility functions: 85% minimum

**Example**:
```typescript
// Button component test
describe('Button Component', () => {
  it('renders correctly with default props', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

### Integration Tests

Located in `src/__tests__/integration/` directories.

**Purpose**: Test interactions between different parts of the application.

**Key Areas**:
- API endpoint integration with database
- Authentication and authorization flows
- Document processing pipelines
- External service integrations

**Example**:
```typescript
// API integration test
describe('Tender API Integration', () => {
  beforeEach(async () => {
    await testServer.resetDatabase();
    testData = await testServer.seedTestData();
  });

  it('should create tender with valid data', async () => {
    const response = await request
      .post('/api/v1/tenders')
      .set('authorization', `Bearer ${testData.token}`)
      .send(validTenderData);
    
    expect(response.status).toBe(201);
    expect(response.body.data).toHaveProperty('id');
  });
});
```

### End-to-End Tests

Located in `apps/web/e2e/` directory.

**Purpose**: Test complete user workflows across the entire application.

**Key Scenarios**:
- User registration and login
- Tender creation and management
- Document upload and processing
- Multi-user workflows
- Cross-browser compatibility

**Example**:
```typescript
// E2E authentication test
test('should register and login user', async ({ page }) => {
  await page.goto('/register');
  await page.fill('[data-testid="email-input"]', 'user@example.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="register-button"]');
  
  await expect(page).toHaveURL('/dashboard');
});
```

### Security Tests

Located in `src/__tests__/security/` directories.

**Purpose**: Identify security vulnerabilities and ensure proper security measures.

**Test Areas**:
- Authentication and authorization
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection
- Rate limiting
- Session management

### Performance Tests

Located in `src/__tests__/performance/` directories.

**Purpose**: Ensure application meets performance requirements.

**Metrics Tracked**:
- Response times
- Memory usage
- Concurrent request handling
- Database query performance
- Resource optimization

## Setup and Configuration

### Prerequisites

1. Node.js 20+
2. Docker and Docker Compose
3. PostgreSQL 15+
4. Redis 7+

### Initial Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup test environment**:
   ```bash
   chmod +x scripts/test-setup.sh
   ./scripts/test-setup.sh
   ```

3. **Verify setup**:
   ```bash
   npm run test:setup
   ```

### Environment Variables

Create `.env.test` files in each application directory:

```bash
# API test environment
NODE_ENV=test
DATABASE_URL=postgresql://test_user:test_password@localhost:5433/tenderflow_test
REDIS_URL=redis://localhost:6380
JWT_SECRET=test-jwt-secret-key
AWS_ENDPOINT_URL=http://localhost:4566
```

## Running Tests

### All Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### By Type

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Security tests only
npm run test:security

# Performance tests only
npm run test:performance
```

### By Package

```bash
# Test specific package
cd apps/api
npm test

# Test with watch mode
npm run test:watch
```

### Docker Testing

```bash
# Run tests in Docker environment
npm run docker:test

# Cleanup after testing
./scripts/test-teardown.sh --clean-volumes
```

## Writing Tests

### Test Structure

Follow the AAA pattern:
- **Arrange**: Set up test data and environment
- **Act**: Execute the code being tested
- **Assert**: Verify the results

```typescript
describe('Feature', () => {
  // Arrange
  beforeEach(() => {
    // Setup common test data
  });

  it('should do something specific', async () => {
    // Arrange
    const input = createTestData();
    
    // Act
    const result = await functionUnderTest(input);
    
    // Assert
    expect(result).toEqual(expectedOutput);
  });
});
```

### Test Data Management

Use fixtures for consistent test data:

```typescript
import { TEST_FIXTURES, createFixture } from '../helpers/fixtures';

const testTender = createFixture(TEST_FIXTURES.tender.scraped);
```

### Async Testing

Always handle promises properly:

```typescript
// Good
it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// Bad - missing await
it('should handle async operation', () => {
  const result = asyncFunction();
  expect(result).toBeDefined(); // Will fail
});
```

### Component Testing Best Practices

1. **Use semantic queries**:
   ```typescript
   // Good
   screen.getByRole('button', { name: /submit/i });
   
   // Avoid
   screen.getByTestId('submit-button');
   ```

2. **Test user interactions**:
   ```typescript
   const user = userEvent.setup();
   await user.click(submitButton);
   await user.type(emailInput, 'user@example.com');
   ```

3. **Mock external dependencies**:
   ```typescript
   jest.mock('../api/client', () => ({
     fetchTenders: jest.fn().mockResolvedValue(mockTenders),
   }));
   ```

### API Testing Best Practices

1. **Use test database**:
   ```typescript
   beforeEach(async () => {
     await testServer.resetDatabase();
   });
   ```

2. **Test authentication**:
   ```typescript
   const { token } = await testServer.seedTestData();
   const response = await request
     .get('/api/v1/protected-route')
     .set('authorization', `Bearer ${token}`);
   ```

3. **Test error cases**:
   ```typescript
   it('should return 400 for invalid data', async () => {
     const response = await request
       .post('/api/v1/endpoint')
       .send(invalidData);
     
     expect(response.status).toBe(400);
   });
   ```

## CI/CD Integration

### GitHub Actions Workflow

The CI/CD pipeline includes multiple stages:

1. **Setup**: Install dependencies and cache
2. **Lint**: Code quality checks
3. **Unit Tests**: Run in parallel for each package
4. **Integration Tests**: With real database
5. **Security Tests**: Vulnerability scanning
6. **Build**: Create production artifacts
7. **E2E Tests**: Full application testing
8. **Performance Tests**: Load and performance testing
9. **Deploy**: Staging and production deployment

### Quality Gates

Tests must pass these quality gates:

- ✅ No ESLint errors
- ✅ All tests pass
- ✅ Code coverage ≥80%
- ✅ No high-severity security issues
- ✅ Performance benchmarks met
- ✅ Bundle size within limits

### Branch Protection

- Main branch requires PR with passing tests
- Develop branch requires passing unit tests
- Feature branches run full test suite

## Quality Gates

### Coverage Requirements

| Component | Minimum Coverage |
|-----------|------------------|
| API Routes | 90% |
| Business Logic | 85% |
| UI Components | 80% |
| Utilities | 85% |
| Overall | 80% |

### Performance Benchmarks

| Metric | Threshold |
|--------|-----------|
| API Response Time | <200ms (95th percentile) |
| Page Load Time | <2s |
| Bundle Size | <500KB (gzipped) |
| Memory Usage | <512MB |

### Security Requirements

- No high or critical vulnerabilities
- All inputs validated
- Authentication required for protected routes
- HTTPS enforcement
- Rate limiting enabled

## Troubleshooting

### Common Issues

#### Test Database Connection Issues

```bash
# Check if containers are running
docker ps

# Restart test containers
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.yml up -d

# Check logs
docker-compose -f docker-compose.test.yml logs
```

#### Port Conflicts

```bash
# Kill processes using test ports
sudo lsof -ti:5433 | xargs kill -9  # Test PostgreSQL
sudo lsof -ti:6380 | xargs kill -9  # Test Redis
sudo lsof -ti:4566 | xargs kill -9  # LocalStack
```

#### Test Timeouts

Increase timeouts in Jest configuration:
```javascript
module.exports = {
  testTimeout: 60000, // 60 seconds
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

#### Memory Issues

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm test
```

### Debug Mode

Run tests with debug information:

```bash
# Jest with debug info
DEBUG=* npm test

# Playwright with debug info
npx playwright test --debug

# API tests with verbose logging
LOG_LEVEL=debug npm run test:integration
```

### Test Data Issues

Reset test database:
```bash
cd apps/api
npx prisma migrate reset --force
npx prisma db seed
```

## Best Practices

1. **Keep tests independent**: Each test should be able to run in isolation
2. **Use descriptive test names**: Clearly describe what is being tested
3. **Test behavior, not implementation**: Focus on what the code does, not how
4. **Mock external dependencies**: Use mocks for APIs, databases, and services
5. **Clean up after tests**: Reset state, close connections, cleanup files
6. **Use factories for test data**: Create reusable test data generators
7. **Test edge cases**: Include boundary conditions and error scenarios
8. **Maintain test performance**: Keep test execution time reasonable

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Testing Best Practices](https://testingjavascript.com/)
- [TenderFlow API Documentation](./api-documentation.md)

## Support

For testing framework support:
- Create an issue in the repository
- Ask questions in team Slack #testing channel
- Review existing test examples in the codebase
- Consult the team's testing champion