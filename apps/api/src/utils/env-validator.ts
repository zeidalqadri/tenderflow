/**
 * Environment Variable Security Validator
 * 
 * This module validates all environment variables for security compliance,
 * ensuring no weak or compromised credentials are used in production.
 */

import crypto from 'crypto';
import { logger } from './logger';

interface ValidationRule {
  name: string;
  required: boolean;
  minLength?: number;
  pattern?: RegExp;
  forbidden?: string[];
  validator?: (value: string) => boolean;
  severity: 'error' | 'warning' | 'info';
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Known compromised or weak credentials that must not be used
const COMPROMISED_CREDENTIALS = [
  'password', // Common default password
  'admin', // Common admin password
  'EXAMPLE_SUPABASE_INSTANCE', // Example Supabase instance
  'your-super-secret-jwt-key-change-in-production', // Example JWT secret
  'your-super-secret-refresh-jwt-key-change-in-production', // Example refresh secret
  'ROTATE_REQUIRED_COMPROMISED_CREDENTIALS', // Placeholder for rotation
  'REQUIRED-GENERATE-SECURE-32-CHAR-MIN-JWT-SECRET-KEY', // Example from template
];

// Environment variable validation rules
const VALIDATION_RULES: ValidationRule[] = [
  // JWT Secrets - CRITICAL SECURITY
  {
    name: 'JWT_SECRET',
    required: true,
    minLength: 32,
    severity: 'error',
    validator: (value: string) => {
      // Must be hex string of at least 32 characters
      // Only check exact matches for compromised values, not substrings
      const isValidHex = /^[a-fA-F0-9]{32,}$/.test(value);
      const isNotCompromised = !COMPROMISED_CREDENTIALS.includes(value);
      return isValidHex && isNotCompromised;
    }
  },
  {
    name: 'JWT_REFRESH_SECRET',
    required: true,
    minLength: 32,
    severity: 'error',
    validator: (value: string) => {
      // Must be hex string of at least 32 characters
      // Only check exact matches for compromised values, not substrings
      const isValidHex = /^[a-fA-F0-9]{32,}$/.test(value);
      const isNotCompromised = !COMPROMISED_CREDENTIALS.includes(value);
      return isValidHex && isNotCompromised;
    }
  },

  // Database Configuration
  {
    name: 'DATABASE_URL',
    required: true,
    severity: 'error',
    validator: (value: string) => {
      // Check for secure database connection
      return value.startsWith('postgresql://') && 
             !COMPROMISED_CREDENTIALS.some(cred => value.includes(cred));
    }
  },

  // Supabase Configuration - COMPROMISED
  {
    name: 'SUPABASE_URL',
    required: false,
    severity: 'error',
    validator: (value: string) => {
      // These specific credentials are compromised and must not be used
      return !COMPROMISED_CREDENTIALS.some(cred => value.includes(cred));
    }
  },
  {
    name: 'SUPABASE_ANON_KEY',
    required: false,
    severity: 'error',
    validator: (value: string) => {
      // These specific credentials are compromised and must not be used
      return !COMPROMISED_CREDENTIALS.some(cred => value.includes(cred));
    }
  },

  // MinIO Configuration
  {
    name: 'MINIO_ACCESS_KEY',
    required: true,
    minLength: 16,
    severity: 'error',
    forbidden: ['admin'],
    validator: (value: string) => {
      // Must be secure and not default credentials
      return value.length >= 16 && !COMPROMISED_CREDENTIALS.includes(value);
    }
  },
  {
    name: 'MINIO_SECRET_KEY',
    required: true,
    minLength: 32,
    severity: 'error',
    forbidden: ['admin'],
    validator: (value: string) => {
      // Must be secure and not default credentials
      return value.length >= 32 && !COMPROMISED_CREDENTIALS.includes(value);
    }
  },

  // Redis Configuration
  {
    name: 'REDIS_URL',
    required: true,
    severity: 'warning'
  },

  // Email Configuration
  {
    name: 'SMTP_PASSWORD',
    required: false,
    minLength: 8,
    severity: 'warning'
  },

  // API Configuration
  {
    name: 'PORT',
    required: true,
    severity: 'info',
    validator: (value: string) => {
      const port = parseInt(value, 10);
      return port >= 1000 && port <= 65535;
    }
  },
  {
    name: 'NODE_ENV',
    required: true,
    severity: 'info',
    pattern: /^(development|staging|production)$/
  }
];

/**
 * Validates a single environment variable against its rule
 */
function validateEnvVar(name: string, value: string | undefined, rule: ValidationRule): string[] {
  const issues: string[] = [];

  // Check if required variable is missing
  if (rule.required && !value) {
    issues.push(`${rule.severity.toUpperCase()}: ${name} is required but not set`);
    return issues;
  }

  // Skip validation if optional and not set
  if (!value) {
    return issues;
  }

  // Check minimum length
  if (rule.minLength && value.length < rule.minLength) {
    issues.push(`${rule.severity.toUpperCase()}: ${name} must be at least ${rule.minLength} characters long`);
  }

  // Check pattern
  if (rule.pattern && !rule.pattern.test(value)) {
    issues.push(`${rule.severity.toUpperCase()}: ${name} does not match required pattern`);
  }

  // Check forbidden values
  if (rule.forbidden && rule.forbidden.includes(value)) {
    issues.push(`${rule.severity.toUpperCase()}: ${name} contains forbidden/insecure value`);
  }

  // Check for compromised credentials
  // Special handling for JWT tokens - only check exact matches for hex tokens
  if (name === 'JWT_SECRET' || name === 'JWT_REFRESH_SECRET') {
    // For JWT secrets, only flag if the entire value matches a compromised credential
    if (COMPROMISED_CREDENTIALS.includes(value)) {
      issues.push(`CRITICAL: ${name} contains COMPROMISED credentials that must be rotated immediately`);
    }
  } else {
    // For other values, check if they contain compromised substrings
    if (COMPROMISED_CREDENTIALS.some(cred => value.includes(cred))) {
      issues.push(`CRITICAL: ${name} contains COMPROMISED credentials that must be rotated immediately`);
    }
  }

  // Run custom validator
  if (rule.validator && !rule.validator(value)) {
    issues.push(`${rule.severity.toUpperCase()}: ${name} failed security validation`);
  }

  return issues;
}

/**
 * Validates all environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.info('Starting environment security validation...');

  for (const rule of VALIDATION_RULES) {
    const value = process.env[rule.name];
    const issues = validateEnvVar(rule.name, value, rule);

    for (const issue of issues) {
      if (issue.startsWith('ERROR') || issue.startsWith('CRITICAL')) {
        errors.push(issue);
      } else if (issue.startsWith('WARNING')) {
        warnings.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  const valid = errors.length === 0;

  // Log results
  if (errors.length > 0) {
    logger.error('Environment validation FAILED with errors:');
    errors.forEach(error => logger.error(`  ${error}`));
  }

  if (warnings.length > 0) {
    logger.warn('Environment validation warnings:');
    warnings.forEach(warning => logger.warn(`  ${warning}`));
  }

  if (valid && warnings.length === 0) {
    logger.info('✅ Environment validation passed - all secrets are secure');
  } else if (valid) {
    logger.warn('⚠️  Environment validation passed with warnings');
  } else {
    logger.error('❌ Environment validation FAILED - SECURITY ISSUES DETECTED');
  }

  return { valid, errors, warnings };
}

/**
 * Generates a secure random secret of specified length
 */
export function generateSecureSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Checks if a secret appears to be secure (not default/weak)
 */
export function isSecureSecret(secret: string): boolean {
  if (!secret || secret.length < 16) return false;
  if (COMPROMISED_CREDENTIALS.some(cred => secret.includes(cred))) return false;
  
  // Check for common weak patterns
  const weakPatterns = [
    /^(password|admin|secret|key|token)$/i,
    /^(123|abc|test|demo|example)/i,
    /^.*(password|admin|secret).*$/i
  ];
  
  return !weakPatterns.some(pattern => pattern.test(secret));
}

/**
 * Validates environment on module load in non-test environments
 */
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
  const result = validateEnvironment();
  
  if (!result.valid) {
    logger.error('CRITICAL: Environment validation failed. Application cannot start with insecure configuration.');
    process.exit(1);
  }
}

// In development with DISABLE_AUTH, skip strict validation
if (process.env.NODE_ENV === 'development' && process.env.DISABLE_AUTH === 'true') {
  logger.info('⚠️  Development mode with DISABLE_AUTH - skipping strict environment validation');
}