// SECURITY: Authentication bypass plugin - DEVELOPMENT ONLY
// This plugin has comprehensive production safeguards and security monitoring
// Will throw an error if used in production environment

import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { assertProductionSafety, detectProductionEnvironment, shouldDisableDevelopmentFeatures } from '../utils/production-detector';
import { securityMonitor } from '../utils/security-monitor';

interface DevAuthOptions {
  disableAuth?: boolean;
}

const devAuthBypassPlugin: FastifyPluginAsync<DevAuthOptions> = async (
  fastify: FastifyInstance,
  options
) => {
  // COMPREHENSIVE SECURITY VALIDATION
  try {
    // This will throw if production environment with dangerous configurations
    assertProductionSafety();
  } catch (error) {
    // Report security violation
    securityMonitor.reportIncident(
      'auth_bypass',
      'critical',
      'Authentication bypass plugin attempted to load in production environment',
      { error: error.message, options },
      'dev-auth-bypass-plugin'
    );
    throw error;
  }

  // Additional comprehensive environment checks
  const envResult = detectProductionEnvironment();
  
  if (envResult.isProdLike) {
    const errorMessage = [
      '🚨 CRITICAL SECURITY VIOLATION 🚨',
      '',
      'Authentication bypass plugin cannot be loaded in production-like environments.',
      '',
      `Detected Environment: ${envResult.environment}`,
      `Platform: ${envResult.platform}`,
      `Security Level: ${envResult.securityLevel}`,
      `Detection Sources: ${envResult.detectedBy.join(', ')}`,
      '',
      'This plugin is strictly for development use only.',
      'Remove or disable this plugin for production deployments.',
    ].join('\n');

    // Report the incident
    securityMonitor.reportIncident(
      'auth_bypass',
      'critical',
      'Dev auth bypass attempted in production-like environment',
      {
        environment: envResult.environment,
        platform: envResult.platform,
        securityLevel: envResult.securityLevel,
        detectedBy: envResult.detectedBy,
        options
      },
      'dev-auth-bypass-plugin'
    );

    throw new Error(errorMessage);
  }

  // Check if development features should be disabled
  if (shouldDisableDevelopmentFeatures()) {
    throw new Error('SECURITY: Development features are disabled in this environment');
  }

  // Final check for dangerous environment variables
  const dangerousVars = ['DISABLE_AUTH', 'SKIP_AUTH', 'BYPASS_AUTH'];
  for (const varName of dangerousVars) {
    const value = process.env[varName];
    if (value && value !== 'false') {
      if (envResult.isProdLike) {
        securityMonitor.reportIncident(
          'auth_bypass',
          'critical',
          `Dangerous auth bypass variable detected: ${varName}`,
          { variable: varName, value, environment: envResult.environment },
          'dev-auth-bypass-plugin'
        );
        throw new Error(`SECURITY VIOLATION: ${varName} is set in production-like environment`);
      }
    }
  }

  const { disableAuth = false } = options;

  if (!disableAuth) {
    fastify.log.info('Dev auth bypass disabled - using normal authentication');
    return;
  }

  fastify.log.warn('⚠️  AUTHENTICATION BYPASS ENABLED - DEVELOPMENT MODE ONLY ⚠️');
  
  // Use hardcoded development user - no database dependency
  const defaultUser = {
    id: 'dev-user-001',
    email: 'dev@tenderflow.com',
    firstName: 'Dev',
    lastName: 'User',
    role: 'admin' as const,
  };
  
  const defaultTenant = {
    id: 'dev-tenant-001',
    name: 'Development Tenant',
    subdomain: 'dev',
    isActive: true,
  };
  
  fastify.log.info({
    userId: defaultUser.id,
    tenantId: defaultTenant.id,
    email: defaultUser.email,
  }, 'Using hardcoded development user for auth bypass')

  // Override the authenticate decorator to inject mock user
  const originalAuthenticate = (fastify as any)[Symbol.for('fastify.authenticate')] || fastify.authenticate;
  
  // Override existing decorator instead of creating new one
  (fastify as any)[Symbol.for('fastify.authenticate')] = async function (request: FastifyRequest, reply: any) {
    // In bypass mode, always inject the default user
    if (disableAuth) {
      request.user = {
        userId: defaultUser.id,
        tenantId: defaultTenant.id,
        role: defaultUser.role,
        email: defaultUser.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
      };
      
      // Also set tenant on request if needed
      (request as any).tenant = defaultTenant;
      
      fastify.log.debug({
        userId: defaultUser.id,
        tenantId: defaultTenant.id,
        mode: 'bypass',
      }, 'Auth bypassed - using default user');
      
      return;
    }
    
    // Fallback to original authenticate if bypass fails
    if (originalAuthenticate) {
      return originalAuthenticate.call(this, request, reply);
    }
  };
  
  // Also update the fastify.authenticate property
  fastify.authenticate = (fastify as any)[Symbol.for('fastify.authenticate')];

  // Override requireTenant to use default tenant
  const originalRequireTenant = (fastify as any)[Symbol.for('fastify.requireTenant')] || (fastify as any).requireTenant;
  if (originalRequireTenant) {
    // Override existing decorator instead of creating new one
    (fastify as any)[Symbol.for('fastify.requireTenant')] = async function (request: FastifyRequest, reply: any) {
      if (disableAuth) {
        (request as any).tenant = defaultTenant;
        return;
      }
      return originalRequireTenant.call(this, request, reply);
    };
    // Update the fastify.requireTenant property
    (fastify as any).requireTenant = (fastify as any)[Symbol.for('fastify.requireTenant')];
  }

  // Override requireTenderRole to always allow access
  const originalRequireTenderRole = (fastify as any)[Symbol.for('fastify.requireTenderRole')] || (fastify as any).requireTenderRole;
  if (originalRequireTenderRole) {
    // Override using Symbol method to avoid decorator conflict
    (fastify as any)[Symbol.for('fastify.requireTenderRole')] = function (source: string, requiredRole: string) {
      return async function (request: FastifyRequest, reply: any) {
        if (disableAuth) {
          // In bypass mode, always allow access
          fastify.log.debug({
            source,
            requiredRole,
            mode: 'bypass',
          }, 'Tender role check bypassed');
          return;
        }
        return originalRequireTenderRole.call(fastify, source, requiredRole)(request, reply);
      };
    };
    // Update the property
    (fastify as any).requireTenderRole = (fastify as any)[Symbol.for('fastify.requireTenderRole')];
  }

  // Override optionalAuthenticate as well
  const originalOptionalAuth = (fastify as any)[Symbol.for('fastify.optionalAuthenticate')] || (fastify as any).optionalAuthenticate;
  if (originalOptionalAuth) {
    // Override using Symbol method to avoid decorator conflict
    (fastify as any)[Symbol.for('fastify.optionalAuthenticate')] = async function (request: FastifyRequest, reply: any) {
      if (disableAuth) {
        request.user = {
          userId: defaultUser.id,
          tenantId: defaultTenant.id,
          role: defaultUser.role,
          email: defaultUser.email,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 86400,
        };
        (request as any).tenant = defaultTenant;
        return;
      }
      return originalOptionalAuth.call(this, request, reply);
    };
    // Update the property
    (fastify as any).optionalAuthenticate = (fastify as any)[Symbol.for('fastify.optionalAuthenticate')];
  }
};

export default fp(devAuthBypassPlugin, {
  name: 'dev-auth-bypass',
  decorators: {
    fastify: ['authenticate'], // Depends on JWT plugin
  },
});