/** @type {import('jest').Config} */
const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'API',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/routes/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/plugins/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 45000,
  verbose: true,
  testEnvironment: 'node',
  globalSetup: '<rootDir>/src/__tests__/helpers/global-setup.ts',
  globalTeardown: '<rootDir>/src/__tests__/helpers/global-teardown.ts',
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '<rootDir>/test-results',
      outputName: 'api-junit.xml',
      suiteName: 'TenderFlow API Tests'
    }]
  ],
  testResultsProcessor: 'jest-junit',
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/src/__tests__/$1'
  }
};