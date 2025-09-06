/**
 * Production Environment Detection and Security Validation
 * 
 * This module provides comprehensive detection of production environments
 * and validates security posture to prevent development code from running
 * in production contexts.
 */

import { logger } from './logger';

export interface ProductionEnvironment {
  isProduction: boolean;
  isProdLike: boolean;
  environment: string;
  platform: string;
  detectedBy: string[];
  securityLevel: 'development' | 'staging' | 'production' | 'critical';
}

export interface SecurityValidation {
  passed: boolean;
  violations: string[];
  warnings: string[];
  recommendations: string[];
}

/**
 * Production environment indicators
 */
const PRODUCTION_INDICATORS = {
  // Traditional production environment
  traditional: {
    NODE_ENV: ['production', 'prod'],
    ENVIRONMENT: ['production', 'prod'],
    APP_ENV: ['production', 'prod'],
  },

  // Cloud platforms
  cloud: {
    // Vercel
    VERCEL: (val: string | undefined) => val !== undefined,
    VERCEL_ENV: ['production'],
    
    // Heroku
    HEROKU: (val: string | undefined) => val !== undefined,
    DYNO: (val: string | undefined) => val !== undefined && !val.includes('localhost'),
    
    // Railway
    RAILWAY: (val: string | undefined) => val !== undefined,
    RAILWAY_ENVIRONMENT: ['production'],
    
    // Render
    RENDER: (val: string | undefined) => val !== undefined,
    RENDER_SERVICE_TYPE: (val: string | undefined) => val !== undefined,
    
    // DigitalOcean App Platform
    DIGITALOCEAN_APP_ID: (val: string | undefined) => val !== undefined,
    
    // Google Cloud Platform
    GOOGLE_CLOUD_PROJECT: (val: string | undefined) => val !== undefined,
    GAE_SERVICE: (val: string | undefined) => val !== undefined,
    
    // Microsoft Azure
    WEBSITE_SITE_NAME: (val: string | undefined) => val !== undefined,
    AZURE_FUNCTIONS_ENVIRONMENT: (val: string | undefined) => val !== undefined,
  },

  // Container platforms
  container: {
    // Kubernetes
    KUBERNETES_SERVICE_HOST: (val: string | undefined) => val !== undefined,
    KUBERNETES_SERVICE_PORT: (val: string | undefined) => val !== undefined,
    
    // Docker production indicators
    DOCKER_CONTAINER: (val: string | undefined) => val !== undefined,
    CONTAINER_NAME: (val: string | undefined) => val !== undefined,
  },

  // Serverless platforms
  serverless: {
    // AWS Lambda
    AWS_LAMBDA_FUNCTION_NAME: (val: string | undefined) => val !== undefined,
    AWS_EXECUTION_ENV: (val: string | undefined) => val?.startsWith('AWS_Lambda_') || false,
    
    // Netlify Functions
    NETLIFY: (val: string | undefined) => val !== undefined,
    NETLIFY_IMAGES_CDN_DOMAIN: (val: string | undefined) => val !== undefined,
    
    // Cloudflare Workers
    CF_WORKER: (val: string | undefined) => val !== undefined,
    
    // Supabase Edge Functions
    SUPABASE_FUNCTION_SLUG: (val: string | undefined) => val !== undefined,
  },

  // CI/CD environments (often production-like)
  cicd: {
    // GitHub Actions
    GITHUB_ACTIONS: (val: string | undefined) => val === 'true',
    GITHUB_WORKFLOW: (val: string | undefined) => val !== undefined,
    
    // GitLab CI
    CI: (val: string | undefined) => val === 'true',
    GITLAB_CI: (val: string | undefined) => val === 'true',
    
    // Jenkins
    JENKINS_URL: (val: string | undefined) => val !== undefined,
    BUILD_NUMBER: (val: string | undefined) => val !== undefined,
    
    // CircleCI
    CIRCLECI: (val: string | undefined) => val === 'true',
    
    // Travis CI
    TRAVIS: (val: string | undefined) => val === 'true',
  }
};

/**
 * Development-only environment indicators
 */
const DEVELOPMENT_INDICATORS = {
  NODE_ENV: ['development', 'dev', 'test'],
  APP_ENV: ['development', 'dev', 'test'],
  ENVIRONMENT: ['development', 'dev', 'test'],
  // Local development indicators
  LOCALHOST: (val: string | undefined) => val === 'true',
  LOCAL: (val: string | undefined) => val === 'true',
  DEV: (val: string | undefined) => val === 'true',
};

/**
 * Dangerous development configurations that must not exist in production
 */
const DANGEROUS_DEV_CONFIGS = [
  'DISABLE_AUTH',
  'SKIP_AUTH',
  'BYPASS_AUTH',
  'DEBUG_AUTH',
  'DISABLE_SECURITY',
  'SKIP_VALIDATION',
  'BYPASS_VALIDATION',
  'DISABLE_RATE_LIMIT',
  'DISABLE_CORS',
  'ALLOW_ALL_ORIGINS',
  'DISABLE_HTTPS',
  'DISABLE_SSL',
  'UNSAFE_MODE',
  'DEBUG_MODE',
  'DEVELOPMENT_MODE',
  'TEST_MODE',
];

/**
 * Detects if the current environment is production or production-like
 */
export function detectProductionEnvironment(): ProductionEnvironment {
  const detectedBy: string[] = [];
  let environment = 'development';
  let platform = 'unknown';
  let securityLevel: 'development' | 'staging' | 'production' | 'critical' = 'development';

  // Check traditional production indicators
  for (const [key, values] of Object.entries(PRODUCTION_INDICATORS.traditional)) {
    const envValue = process.env[key];
    if (envValue && values.includes(envValue.toLowerCase())) {
      detectedBy.push(`${key}=${envValue}`);
      environment = 'production';
      platform = 'traditional';
      securityLevel = 'production';
    }
  }

  // Check cloud platforms
  for (const [key, validator] of Object.entries(PRODUCTION_INDICATORS.cloud)) {
    const envValue = process.env[key];
    const isMatch = typeof validator === 'function' 
      ? validator(envValue)
      : Array.isArray(validator) 
        ? envValue && validator.includes(envValue.toLowerCase())
        : false;

    if (isMatch) {
      detectedBy.push(`${key}${envValue ? `=${envValue}` : ' (present)'}`);
      environment = 'production';
      
      // Determine platform
      if (key.startsWith('VERCEL')) platform = 'vercel';
      else if (key.startsWith('HEROKU') || key === 'DYNO') platform = 'heroku';
      else if (key.startsWith('RAILWAY')) platform = 'railway';
      else if (key.startsWith('RENDER')) platform = 'render';
      else if (key.startsWith('DIGITALOCEAN')) platform = 'digitalocean';
      else if (key.startsWith('GOOGLE') || key.startsWith('GAE')) platform = 'gcp';
      else if (key.startsWith('WEBSITE') || key.startsWith('AZURE')) platform = 'azure';
      else platform = 'cloud';
      
      securityLevel = 'production';
    }
  }

  // Check container platforms
  for (const [key, validator] of Object.entries(PRODUCTION_INDICATORS.container)) {
    const envValue = process.env[key];
    if (typeof validator === 'function' && validator(envValue)) {
      detectedBy.push(`${key}${envValue ? `=${envValue}` : ' (present)'}`);
      environment = 'production';
      platform = key.startsWith('KUBERNETES') ? 'kubernetes' : 'docker';
      securityLevel = 'critical'; // Container environments are often critical
    }
  }

  // Check serverless platforms
  for (const [key, validator] of Object.entries(PRODUCTION_INDICATORS.serverless)) {
    const envValue = process.env[key];
    if (typeof validator === 'function' && validator(envValue)) {
      detectedBy.push(`${key}${envValue ? `=${envValue}` : ' (present)'}`);
      environment = 'production';
      
      // Determine serverless platform
      if (key.startsWith('AWS')) platform = 'aws-lambda';
      else if (key.startsWith('NETLIFY')) platform = 'netlify';
      else if (key.startsWith('CF_')) platform = 'cloudflare';
      else if (key.startsWith('SUPABASE')) platform = 'supabase';
      else platform = 'serverless';
      
      securityLevel = 'production';
    }
  }

  // Check CI/CD environments (production-like but not production)
  for (const [key, validator] of Object.entries(PRODUCTION_INDICATORS.cicd)) {
    const envValue = process.env[key];
    if (typeof validator === 'function' && validator(envValue)) {
      detectedBy.push(`${key}${envValue ? `=${envValue}` : ' (present)'}`);
      
      // CI/CD is production-like but not production
      if (environment === 'development') {
        environment = 'staging';
        securityLevel = 'staging';
      }
      
      // Determine CI/CD platform
      if (key.startsWith('GITHUB')) platform = 'github-actions';
      else if (key.startsWith('GITLAB') || key === 'CI') platform = 'gitlab-ci';
      else if (key.startsWith('JENKINS')) platform = 'jenkins';
      else if (key.startsWith('CIRCLE')) platform = 'circleci';
      else if (key.startsWith('TRAVIS')) platform = 'travis';
      else platform = 'cicd';
    }
  }

  // Check for development indicators that might override production detection
  let isDevelopment = false;
  for (const [key, validator] of Object.entries(DEVELOPMENT_INDICATORS)) {
    const envValue = process.env[key];
    const isMatch = typeof validator === 'function'
      ? validator(envValue)
      : Array.isArray(validator)
        ? envValue && validator.includes(envValue.toLowerCase())
        : false;

    if (isMatch) {
      isDevelopment = true;
      break;
    }
  }

  // If we have explicit development indicators, override production detection
  if (isDevelopment && environment === 'production') {
    environment = 'development';
    securityLevel = 'development';
  }

  const isProduction = environment === 'production';
  const isProdLike = environment === 'production' || environment === 'staging' || detectedBy.length > 0;

  return {
    isProduction,
    isProdLike,
    environment,
    platform,
    detectedBy,
    securityLevel,
  };
}

/**
 * Validates security configuration for the detected environment
 */
export function validateSecurityConfiguration(prodEnv: ProductionEnvironment): SecurityValidation {
  const violations: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Check for dangerous development configurations
  for (const dangerousConfig of DANGEROUS_DEV_CONFIGS) {
    const value = process.env[dangerousConfig];
    
    if (value !== undefined) {
      if (prodEnv.isProdLike) {
        violations.push(`CRITICAL: ${dangerousConfig} is set in production environment (${prodEnv.environment})`);
      } else {
        warnings.push(`WARNING: ${dangerousConfig} is set - ensure this is intentional for development`);
      }
    }
  }

  // Production-specific validations
  if (prodEnv.isProduction) {
    // Ensure NODE_ENV is explicitly set to production
    if (process.env.NODE_ENV !== 'production') {
      violations.push('CRITICAL: NODE_ENV must be set to "production" in production environment');
    }

    // Check for development-only dependencies or configurations
    if (process.env.NODE_ENV === 'development') {
      violations.push('CRITICAL: NODE_ENV is set to "development" but production environment detected');
    }

    // Check for insecure configurations
    if (process.env.CORS_ORIGIN === '*' || process.env.CORS_ORIGIN === 'true') {
      warnings.push('WARNING: CORS_ORIGIN allows all origins - consider restricting in production');
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      violations.push('CRITICAL: JWT_SECRET must be at least 32 characters in production');
    }

    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
      violations.push('CRITICAL: JWT_REFRESH_SECRET must be at least 32 characters in production');
    }
  }

  // Platform-specific validations
  if (prodEnv.platform === 'vercel' && !process.env.VERCEL_ENV) {
    warnings.push('WARNING: Running on Vercel but VERCEL_ENV not set');
  }

  if (prodEnv.platform === 'heroku' && !process.env.PORT) {
    warnings.push('WARNING: Running on Heroku but PORT not set');
  }

  // Add recommendations
  if (prodEnv.isProdLike) {
    recommendations.push('Ensure all secrets are rotated regularly');
    recommendations.push('Monitor security logs for unauthorized access attempts');
    recommendations.push('Validate SSL/TLS configuration');
    recommendations.push('Enable security headers and CSP');
  }

  const passed = violations.length === 0;

  return {
    passed,
    violations,
    warnings,
    recommendations,
  };
}

/**
 * Performs comprehensive production security validation
 */
export function performSecurityValidation(): {
  environment: ProductionEnvironment;
  security: SecurityValidation;
  shouldBlock: boolean;
} {
  logger.info('🔍 Performing comprehensive production environment detection...');

  const environment = detectProductionEnvironment();
  const security = validateSecurityConfiguration(environment);

  // Log environment detection results
  logger.info(`Environment Detection Results:`, {
    isProduction: environment.isProduction,
    isProdLike: environment.isProdLike,
    environment: environment.environment,
    platform: environment.platform,
    securityLevel: environment.securityLevel,
    detectedBy: environment.detectedBy,
  });

  // Log security validation results
  if (security.violations.length > 0) {
    logger.error('🚨 CRITICAL SECURITY VIOLATIONS DETECTED:');
    security.violations.forEach(violation => logger.error(`  ${violation}`));
  }

  if (security.warnings.length > 0) {
    logger.warn('⚠️  Security warnings:');
    security.warnings.forEach(warning => logger.warn(`  ${warning}`));
  }

  if (security.recommendations.length > 0) {
    logger.info('💡 Security recommendations:');
    security.recommendations.forEach(rec => logger.info(`  ${rec}`));
  }

  // Determine if we should block startup
  const shouldBlock = !security.passed && environment.isProdLike;

  if (shouldBlock) {
    logger.error('🛑 APPLICATION STARTUP BLOCKED due to security violations in production environment');
  } else if (security.passed) {
    logger.info('✅ Security validation passed');
  }

  return {
    environment,
    security,
    shouldBlock,
  };
}

/**
 * Returns true if development features should be disabled
 */
export function shouldDisableDevelopmentFeatures(): boolean {
  const { environment } = performSecurityValidation();
  return environment.isProdLike;
}

/**
 * Throws an error if running in production with dangerous configuration
 */
export function assertProductionSafety(): void {
  const { security, shouldBlock } = performSecurityValidation();
  
  if (shouldBlock) {
    const errorMessage = [
      '🚨 PRODUCTION SECURITY VIOLATION 🚨',
      '',
      'The application cannot start due to dangerous security configurations:',
      ...security.violations.map(v => `  • ${v}`),
      '',
      'Please fix these security issues before deploying to production.',
      '',
      'For development environments, ensure NODE_ENV=development is set.',
    ].join('\n');
    
    throw new Error(errorMessage);
  }
}