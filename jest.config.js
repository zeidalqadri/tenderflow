// Root Jest configuration for TenderFlow monorepo
const base = require('./jest.config.base');

module.exports = {
  ...base,
  projects: [
    '<rootDir>/apps/api',
    '<rootDir>/apps/web',
    '<rootDir>/packages/jobs',
    '<rootDir>/packages/shared',
    '<rootDir>/packages/ui'
  ],
  collectCoverageFrom: [
    '<rootDir>/apps/*/src/**/*.{ts,tsx}',
    '<rootDir>/packages/*/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/__tests__/**',
    '!**/__mocks__/**',
    '!**/index.ts',
    '!**/*.test.{ts,tsx}',
    '!**/*.spec.{ts,tsx}'
  ],
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/.next/',
    '/build/',
    '/coverage/'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/dist/',
    '/build/',
    '/e2e/'
  ]
};