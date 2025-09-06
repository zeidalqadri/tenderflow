/**
 * Security Monitoring and Incident Response System
 * 
 * This module provides real-time security monitoring, incident detection,
 * and automated response to security violations.
 */

import { logger } from './logger';
import { detectProductionEnvironment, validateSecurityConfiguration } from './production-detector';

export interface SecurityIncident {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'auth_bypass' | 'config_violation' | 'environment_mismatch' | 'suspicious_activity' | 'security_misconfiguration';
  description: string;
  details: Record<string, any>;
  source: string;
  resolved: boolean;
}

export interface SecurityMetrics {
  totalIncidents: number;
  criticalIncidents: number;
  resolvedIncidents: number;
  lastIncident?: Date;
  securityScore: number;
}

class SecurityMonitor {
  private incidents: SecurityIncident[] = [];
  private monitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Starts continuous security monitoring
   */
  public startMonitoring(): void {
    if (this.monitoring) return;

    this.monitoring = true;
    logger.info('🛡️  Starting security monitoring system...');

    // Perform initial security assessment
    this.performSecurityAssessment();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.performPeriodicChecks();
    }, 60000); // Check every minute

    logger.info('✅ Security monitoring system started');
  }

  /**
   * Stops security monitoring
   */
  public stopMonitoring(): void {
    if (!this.monitoring) return;

    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('🛡️  Security monitoring system stopped');
  }

  /**
   * Reports a security incident
   */
  public reportIncident(
    type: SecurityIncident['type'],
    severity: SecurityIncident['severity'],
    description: string,
    details: Record<string, any> = {},
    source = 'security-monitor'
  ): SecurityIncident {
    const incident: SecurityIncident = {
      id: this.generateIncidentId(),
      timestamp: new Date(),
      severity,
      type,
      description,
      details,
      source,
      resolved: false,
    };

    this.incidents.push(incident);

    // Log the incident
    const logLevel = severity === 'critical' ? 'error' : severity === 'high' ? 'error' : 'warn';
    logger[logLevel](`🚨 SECURITY INCIDENT [${incident.id}]`, {
      severity,
      type,
      description,
      details,
      source,
    });

    // Handle critical incidents immediately
    if (severity === 'critical') {
      this.handleCriticalIncident(incident);
    }

    return incident;
  }

  /**
   * Resolves a security incident
   */
  public resolveIncident(incidentId: string, resolution?: string): boolean {
    const incident = this.incidents.find(i => i.id === incidentId);
    if (!incident) {
      logger.warn(`Attempted to resolve non-existent incident: ${incidentId}`);
      return false;
    }

    incident.resolved = true;
    logger.info(`✅ Security incident resolved [${incidentId}]`, { resolution });
    return true;
  }

  /**
   * Gets current security metrics
   */
  public getSecurityMetrics(): SecurityMetrics {
    const totalIncidents = this.incidents.length;
    const criticalIncidents = this.incidents.filter(i => i.severity === 'critical').length;
    const resolvedIncidents = this.incidents.filter(i => i.resolved).length;
    const lastIncident = this.incidents.length > 0 
      ? this.incidents[this.incidents.length - 1].timestamp 
      : undefined;

    // Calculate security score (0-100)
    let securityScore = 100;
    securityScore -= Math.min(criticalIncidents * 20, 80); // Critical incidents heavily impact score
    securityScore -= Math.min((totalIncidents - criticalIncidents) * 5, 20); // Other incidents
    securityScore = Math.max(securityScore, 0);

    return {
      totalIncidents,
      criticalIncidents,
      resolvedIncidents,
      lastIncident,
      securityScore,
    };
  }

  /**
   * Gets all security incidents
   */
  public getIncidents(filter?: {
    severity?: SecurityIncident['severity'];
    type?: SecurityIncident['type'];
    resolved?: boolean;
  }): SecurityIncident[] {
    let filtered = this.incidents;

    if (filter) {
      if (filter.severity) {
        filtered = filtered.filter(i => i.severity === filter.severity);
      }
      if (filter.type) {
        filtered = filtered.filter(i => i.type === filter.type);
      }
      if (filter.resolved !== undefined) {
        filtered = filtered.filter(i => i.resolved === filter.resolved);
      }
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Performs initial security assessment
   */
  private performSecurityAssessment(): void {
    logger.info('🔍 Performing initial security assessment...');

    const envResult = detectProductionEnvironment();
    const securityResult = validateSecurityConfiguration(envResult);

    // Report environment mismatches
    if (envResult.isProduction && process.env.NODE_ENV !== 'production') {
      this.reportIncident(
        'environment_mismatch',
        'critical',
        'Production environment detected but NODE_ENV is not set to production',
        { nodeEnv: process.env.NODE_ENV, detectedEnv: envResult.environment },
        'environment-detector'
      );
    }

    // Report security violations
    securityResult.violations.forEach(violation => {
      this.reportIncident(
        'config_violation',
        'critical',
        violation,
        { environment: envResult.environment, platform: envResult.platform },
        'security-validator'
      );
    });

    // Report dangerous development configurations
    const dangerousConfigs = [
      'DISABLE_AUTH', 'SKIP_AUTH', 'BYPASS_AUTH', 'DEBUG_AUTH',
      'DISABLE_SECURITY', 'SKIP_VALIDATION', 'BYPASS_VALIDATION'
    ];

    dangerousConfigs.forEach(config => {
      if (process.env[config]) {
        const severity = envResult.isProdLike ? 'critical' : 'medium';
        this.reportIncident(
          'security_misconfiguration',
          severity,
          `Dangerous configuration detected: ${config}`,
          { config, value: process.env[config], environment: envResult.environment },
          'config-scanner'
        );
      }
    });

    logger.info('✅ Initial security assessment completed');
  }

  /**
   * Performs periodic security checks
   */
  private performPeriodicChecks(): void {
    // Check for authentication bypass attempts
    this.checkAuthenticationBypass();

    // Check for suspicious environment changes
    this.checkEnvironmentChanges();

    // Check for security configuration drift
    this.checkConfigurationDrift();

    // Clean up old resolved incidents (keep for 24 hours)
    this.cleanupOldIncidents();
  }

  /**
   * Checks for authentication bypass attempts
   */
  private checkAuthenticationBypass(): void {
    const authBypassVars = ['DISABLE_AUTH', 'SKIP_AUTH', 'BYPASS_AUTH'];
    const envResult = detectProductionEnvironment();

    authBypassVars.forEach(varName => {
      const value = process.env[varName];
      if (value && value !== 'false') {
        if (envResult.isProdLike) {
          this.reportIncident(
            'auth_bypass',
            'critical',
            `Authentication bypass detected in production environment: ${varName}`,
            { variable: varName, value, environment: envResult.environment },
            'auth-monitor'
          );
        }
      }
    });
  }

  /**
   * Checks for suspicious environment changes
   */
  private checkEnvironmentChanges(): void {
    // This would ideally track changes over time
    // For now, we check for inconsistent environment indicators
    const nodeEnv = process.env.NODE_ENV;
    const envResult = detectProductionEnvironment();

    if (nodeEnv === 'development' && envResult.isProdLike) {
      this.reportIncident(
        'environment_mismatch',
        'high',
        'Environment inconsistency: NODE_ENV=development but production environment detected',
        { nodeEnv, detectedEnvironment: envResult.environment, platform: envResult.platform },
        'environment-monitor'
      );
    }
  }

  /**
   * Checks for security configuration drift
   */
  private checkConfigurationDrift(): void {
    const envResult = detectProductionEnvironment();
    
    if (envResult.isProdLike) {
      // Check JWT secrets
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        this.reportIncident(
          'security_misconfiguration',
          'critical',
          'JWT_SECRET is missing or too short for production environment',
          { length: process.env.JWT_SECRET?.length || 0, environment: envResult.environment },
          'config-monitor'
        );
      }

      // Check for weak CORS configuration
      if (process.env.CORS_ORIGIN === '*' && envResult.isProduction) {
        this.reportIncident(
          'security_misconfiguration',
          'medium',
          'CORS_ORIGIN allows all origins in production environment',
          { corsOrigin: process.env.CORS_ORIGIN, environment: envResult.environment },
          'cors-monitor'
        );
      }
    }
  }

  /**
   * Handles critical incidents with immediate response
   */
  private handleCriticalIncident(incident: SecurityIncident): void {
    logger.error('🚨 CRITICAL SECURITY INCIDENT - IMMEDIATE ACTION REQUIRED', incident);

    // For critical auth bypass or config violations in production, we should consider
    // more drastic measures, but for now we log extensively
    if (incident.type === 'auth_bypass' || incident.type === 'config_violation') {
      logger.error('⛔ SECURITY BREACH DETECTED - REVIEW DEPLOYMENT IMMEDIATELY');
      logger.error('📋 Incident Details:', {
        id: incident.id,
        type: incident.type,
        description: incident.description,
        timestamp: incident.timestamp.toISOString(),
        details: incident.details,
      });
    }
  }

  /**
   * Cleans up old resolved incidents
   */
  private cleanupOldIncidents(): void {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const initialLength = this.incidents.length;
    
    this.incidents = this.incidents.filter(incident => {
      if (incident.resolved && incident.timestamp < twentyFourHoursAgo) {
        return false; // Remove old resolved incidents
      }
      return true; // Keep recent or unresolved incidents
    });

    const removedCount = initialLength - this.incidents.length;
    if (removedCount > 0) {
      logger.debug(`🧹 Cleaned up ${removedCount} old security incidents`);
    }
  }

  /**
   * Generates a unique incident ID
   */
  private generateIncidentId(): string {
    return `SEC-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
}

// Export singleton instance
export const securityMonitor = new SecurityMonitor();

/**
 * Validates that the security monitor is functioning
 */
export function validateSecurityMonitor(): boolean {
  try {
    const metrics = securityMonitor.getSecurityMetrics();
    logger.info('🛡️  Security monitor validation:', metrics);
    return true;
  } catch (error) {
    logger.error('❌ Security monitor validation failed:', error);
    return false;
  }
}

/**
 * Gets a security health report
 */
export function getSecurityHealthReport(): {
  status: 'healthy' | 'warning' | 'critical';
  metrics: SecurityMetrics;
  activeIncidents: SecurityIncident[];
  recommendations: string[];
} {
  const metrics = securityMonitor.getSecurityMetrics();
  const activeIncidents = securityMonitor.getIncidents({ resolved: false });
  const recommendations: string[] = [];

  // Determine overall status
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';

  if (metrics.criticalIncidents > 0) {
    status = 'critical';
    recommendations.push('Resolve all critical security incidents immediately');
  } else if (activeIncidents.length > 0) {
    status = 'warning';
    recommendations.push('Review and resolve active security incidents');
  }

  if (metrics.securityScore < 70) {
    status = status === 'healthy' ? 'warning' : status;
    recommendations.push('Security score is below acceptable threshold (70)');
  }

  // Add general recommendations
  if (status !== 'critical') {
    recommendations.push('Regularly rotate secrets and API keys');
    recommendations.push('Monitor security logs for suspicious activity');
    recommendations.push('Keep security configurations up to date');
  }

  return {
    status,
    metrics,
    activeIncidents,
    recommendations,
  };
}