/**
 * Security Monitoring and Health Routes
 * 
 * Provides endpoints for monitoring security status, incidents,
 * and overall security health of the application.
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { securityMonitor, getSecurityHealthReport } from '../utils/security-monitor';
import { detectProductionEnvironment, performSecurityValidation } from '../utils/production-detector';

const securityRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  
  /**
   * Security Health Check Endpoint
   * Returns overall security status and metrics
   */
  fastify.get('/security/health', async (request, reply) => {
    try {
      const healthReport = getSecurityHealthReport();
      const envInfo = detectProductionEnvironment();

      const response = {
        status: healthReport.status,
        timestamp: new Date().toISOString(),
        environment: {
          detected: envInfo.environment,
          platform: envInfo.platform,
          isProduction: envInfo.isProduction,
          isProdLike: envInfo.isProdLike,
          securityLevel: envInfo.securityLevel,
        },
        metrics: healthReport.metrics,
        activeIncidents: healthReport.activeIncidents.length,
        recommendations: healthReport.recommendations,
      };

      // Set appropriate HTTP status based on security status
      const statusCode = healthReport.status === 'critical' ? 503 : 
                        healthReport.status === 'warning' ? 202 : 200;

      return reply.status(statusCode).send(response);
    } catch (error) {
      fastify.log.error('Error generating security health report:', error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to generate security health report',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * Security Incidents Endpoint
   * Returns security incidents with optional filtering
   */
  fastify.get('/security/incidents', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          type: { type: 'string', enum: ['auth_bypass', 'config_violation', 'environment_mismatch', 'suspicious_activity', 'security_misconfiguration'] },
          resolved: { type: 'boolean' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const query = request.query as any;
      const filter: any = {};
      
      if (query.severity) filter.severity = query.severity;
      if (query.type) filter.type = query.type;
      if (query.resolved !== undefined) filter.resolved = query.resolved;

      const incidents = securityMonitor.getIncidents(filter);
      const limited = incidents.slice(0, query.limit || 20);

      return reply.send({
        incidents: limited,
        total: incidents.length,
        filtered: limited.length,
        filter,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error('Error retrieving security incidents:', error);
      return reply.status(500).send({
        error: 'Failed to retrieve security incidents',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * Security Metrics Endpoint
   * Returns detailed security metrics
   */
  fastify.get('/security/metrics', async (request, reply) => {
    try {
      const metrics = securityMonitor.getSecurityMetrics();
      const envInfo = detectProductionEnvironment();
      const securityValidation = performSecurityValidation();

      return reply.send({
        metrics,
        environment: envInfo,
        validation: {
          passed: securityValidation.security.passed,
          violationsCount: securityValidation.security.violations.length,
          warningsCount: securityValidation.security.warnings.length,
          recommendationsCount: securityValidation.security.recommendations.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error('Error generating security metrics:', error);
      return reply.status(500).send({
        error: 'Failed to generate security metrics',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * Resolve Security Incident Endpoint
   * Allows manual resolution of security incidents
   */
  fastify.post('/security/incidents/:incidentId/resolve', {
    schema: {
      params: {
        type: 'object',
        required: ['incidentId'],
        properties: {
          incidentId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          resolution: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { incidentId } = request.params as any;
      const { resolution } = request.body as any;

      const success = securityMonitor.resolveIncident(incidentId, resolution);

      if (success) {
        return reply.send({
          success: true,
          message: `Incident ${incidentId} resolved successfully`,
          timestamp: new Date().toISOString(),
        });
      } else {
        return reply.status(404).send({
          success: false,
          message: `Incident ${incidentId} not found`,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      fastify.log.error('Error resolving security incident:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to resolve security incident',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * Security Configuration Check Endpoint
   * Performs real-time security configuration validation
   */
  fastify.post('/security/validate', async (request, reply) => {
    try {
      const validationResult = performSecurityValidation();

      return reply.send({
        environment: validationResult.environment,
        security: {
          passed: validationResult.security.passed,
          violations: validationResult.security.violations,
          warnings: validationResult.security.warnings,
          recommendations: validationResult.security.recommendations,
        },
        shouldBlock: validationResult.shouldBlock,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error('Error performing security validation:', error);
      return reply.status(500).send({
        error: 'Failed to perform security validation',
        timestamp: new Date().toISOString(),
      });
    }
  });
};

export default fp(securityRoutes, {
  name: 'security-routes',
  decorators: {
    fastify: [], // No required decorators for security endpoints
  },
});