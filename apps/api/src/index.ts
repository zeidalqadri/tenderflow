// TenderFlow Fastify API Server Entry Point
import { createServer, ServerConfig } from './server';
import { workerManager } from './workers';
import { setupRecurringJobs } from './services/queue';
import { shutdownRedis } from './services/redis';
import { shutdownQueues } from './services/queue';
import { logStartup, logShutdown, logError, logInfo, logSuccess } from './utils/logger';
import { validateEnvironment } from './utils/env-validator';

// Global references for cleanup
let server: any;
let socketIOService: any;

async function start() {
  // COMPREHENSIVE SECURITY VALIDATION SYSTEM
  logInfo('STARTUP', '🛡️  Initializing comprehensive security validation system...');
  
  // Import security modules
  const { performSecurityValidation, assertProductionSafety } = await import('./utils/production-detector');
  const { securityMonitor, validateSecurityMonitor } = await import('./utils/security-monitor');
  
  try {
    // Step 1: Comprehensive Production Environment Detection and Security Validation
    logInfo('STARTUP', '🔍 Performing comprehensive security assessment...');
    
    const securityResult = performSecurityValidation();
    
    // Log detailed security assessment results
    logInfo('STARTUP', 'Security Assessment Results:', {
      environment: securityResult.environment.environment,
      platform: securityResult.environment.platform,
      securityLevel: securityResult.environment.securityLevel,
      isProduction: securityResult.environment.isProduction,
      isProdLike: securityResult.environment.isProdLike,
      detectedBy: securityResult.environment.detectedBy,
      securityPassed: securityResult.security.passed,
      violations: securityResult.security.violations.length,
      warnings: securityResult.security.warnings.length,
    });
    
    // Step 2: Block startup if critical security violations detected
    if (securityResult.shouldBlock) {
      logError('STARTUP', '🚨 CRITICAL SECURITY VIOLATIONS DETECTED - STARTUP BLOCKED');
      securityResult.security.violations.forEach(violation => 
        logError('SECURITY', `VIOLATION: ${violation}`)
      );
      logError('STARTUP', 'Fix all security violations before starting the application');
      process.exit(1);
    }
    
    // Step 3: Report warnings but allow startup
    if (securityResult.security.warnings.length > 0) {
      logInfo('STARTUP', '⚠️  Security warnings detected (startup allowed):');
      securityResult.security.warnings.forEach(warning => 
        logError('SECURITY', `WARNING: ${warning}`)
      );
    }
    
    // Step 4: Validate security monitor is functioning
    const monitorValid = validateSecurityMonitor();
    if (!monitorValid) {
      logError('STARTUP', 'Security monitor validation failed');
      process.exit(1);
    }
    
    logSuccess('STARTUP', '✅ Comprehensive security validation completed');
    
    // Step 5: Legacy environment validation for backwards compatibility
    // Skip if DISABLE_AUTH is true in development
    if (process.env.DISABLE_AUTH !== 'true') {
      logInfo('STARTUP', 'Performing legacy environment validation...');
      
      const envValidation = validateEnvironment();
      if (!envValidation.valid) {
        logError('STARTUP', 'Legacy environment validation failed - application cannot start with compromised credentials');
        envValidation.errors.forEach(error => logError('SECURITY', error));
        process.exit(1);
      }
      
      if (envValidation.warnings.length > 0) {
        envValidation.warnings.forEach(warning => logError('SECURITY', warning));
      }
      
      logSuccess('STARTUP', 'Legacy environment security validation passed');
    } else {
      logInfo('STARTUP', '⚠️  Skipping legacy environment validation due to DISABLE_AUTH=true');
    }
    
    // Step 6: Assert production safety (throws on dangerous configurations)
    try {
      assertProductionSafety();
    } catch (error) {
      logError('STARTUP', 'Production safety assertion failed:', error);
      process.exit(1);
    }
    
    logSuccess('STARTUP', '🔒 All security validations passed - startup approved');
    
  } catch (error) {
    logError('STARTUP', 'Security validation system failed:', error);
    process.exit(1);
  }

  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3457'),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: (process.env.NODE_ENV as any) || 'development',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    corsOrigin: process.env.CORS_ORIGIN || true,
    jwtSecret: process.env.JWT_SECRET,
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/tenderflow',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    s3Bucket: process.env.S3_BUCKET || 'tenderflow-documents',
    s3Region: process.env.S3_REGION || 'us-east-1',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  };

  try {
    logStartup('TenderFlow API Server', config);
    
    // Initialize server
    server = await createServer(config);
    
    // Start BullMQ workers
    logInfo('STARTUP', 'Starting background workers...');
    await workerManager.start();
    
    // Setup recurring jobs
    logInfo('STARTUP', 'Setting up recurring jobs...');
    await setupRecurringJobs();
    
    // Start the server
    await server.listen({ 
      port: config.port, 
      host: config.host 
    });

    // Store Socket.IO service reference for cleanup
    socketIOService = (server as any).socketio;
    
    logSuccess('STARTUP', 'TenderFlow API Server started successfully', {
      server: `http://${config.host}:${config.port}`,
      docs: `http://${config.host}:${config.port}/docs`,
      environment: config.nodeEnv,
      logLevel: config.logLevel,
      endpoints: {
        health: `http://${config.host}:${config.port}/health`,
        auth: `http://${config.host}:${config.port}/api/v1/auth`,
        tenders: `http://${config.host}:${config.port}/api/v1/tenders`,
        scraper: `http://${config.host}:${config.port}/api/v1/scraper`
      }
    });
  } catch (err) {
    logError('STARTUP', 'Error starting server', err as Error);
    process.exit(1);
  }
}

// Graceful shutdown function
async function shutdown(signal: string) {
  logShutdown('TenderFlow API Server', signal);

  try {
    // Stop accepting new requests
    if (server) {
      logInfo('SHUTDOWN', 'Closing HTTP server...');
      await server.close();
    }

    // Shutdown Socket.IO service
    if (socketIOService) {
      logInfo('SHUTDOWN', 'Shutting down Socket.IO service...');
      await socketIOService.shutdown();
    }

    // Shutdown workers
    logInfo('SHUTDOWN', 'Shutting down background workers...');
    await workerManager.stop();

    // Shutdown queues
    logInfo('SHUTDOWN', 'Shutting down job queues...');
    await shutdownQueues();

    // Shutdown Redis
    logInfo('SHUTDOWN', 'Shutting down Redis connections...');
    await shutdownRedis();

    logSuccess('SHUTDOWN', 'Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logError('SHUTDOWN', 'Error during shutdown', error as Error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError('UNCAUGHT_EXCEPTION', 'Uncaught Exception', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logError('UNHANDLED_REJECTION', 'Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)), { promise });
  shutdown('UNHANDLED_REJECTION');
});

start();