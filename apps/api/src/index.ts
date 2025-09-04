// TenderFlow Fastify API Server Entry Point
import { createServer, ServerConfig } from './server';
import { WorkerManager } from './services/workers';
import { setupRecurringJobs } from './services/queue';
import { shutdownRedis } from './services/redis';
import { shutdownQueues } from './services/queue';

// Global references for cleanup
let server: any;
let workerManager: WorkerManager;
let webSocketService: any;

async function start() {
  // Validate required environment variables
  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET environment variable is required');
    process.exit(1);
  }
  
  // Ensure JWT secret is long enough for security
  if (process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters long');
    process.exit(1);
  }

  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3001'),
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
    console.log('🚀 Starting TenderFlow API Server...');
    
    // Initialize server
    server = await createServer(config);
    
    // Start BullMQ workers
    console.log('⚙️  Starting background workers...');
    workerManager = new WorkerManager();
    
    // Setup recurring jobs
    console.log('⏰ Setting up recurring jobs...');
    await setupRecurringJobs();
    
    // Start the server
    await server.listen({ 
      port: config.port, 
      host: config.host 
    });

    // Store WebSocket service reference for cleanup
    webSocketService = (server as any).websocket;
    
    console.log(`
🚀 TenderFlow API Server is running!

📍 Server: http://${config.host}:${config.port}
📚 API Docs: http://${config.host}:${config.port}/docs
🌍 Environment: ${config.nodeEnv}
📊 Log Level: ${config.logLevel}

🔗 HTTP Endpoints:
  - Health: http://${config.host}:${config.port}/health
  - API Docs: http://${config.host}:${config.port}/docs
  - Auth: http://${config.host}:${config.port}/api/v1/auth
  - Tenders: http://${config.host}:${config.port}/api/v1/tenders
  - Scraper: http://${config.host}:${config.port}/api/v1/scraper
  - Documents: http://${config.host}:${config.port}/api/v1/documents
  - Bids: http://${config.host}:${config.port}/api/v1/bids
  - Submissions: http://${config.host}:${config.port}/api/v1/submissions
  - Exports: http://${config.host}:${config.port}/api/v1/exports

🔌 WebSocket Endpoints:
  - Main: ws://${config.host}:${config.port}/api/v1/ws
  - Job Progress: ws://${config.host}:${config.port}/api/v1/ws/jobs/:jobId
  - Tenant: ws://${config.host}:${config.port}/api/v1/ws/tenant/:tenantId

⚙️  Background Services:
  ✅ BullMQ Workers: Scraping, Processing, Notifications
  ✅ Redis Cache: Session & queue management
  ✅ WebSocket: Real-time updates
  ✅ Recurring Jobs: Cleanup & maintenance

🔧 Use Ctrl+C to stop the server
    `);
  } catch (err) {
    console.error('❌ Error starting server:', err);
    process.exit(1);
  }
}

// Graceful shutdown function
async function shutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

  try {
    // Stop accepting new requests
    if (server) {
      console.log('🔌 Closing HTTP server...');
      await server.close();
    }

    // Shutdown WebSocket service
    if (webSocketService) {
      console.log('🔌 Shutting down WebSocket service...');
      await webSocketService.shutdown();
    }

    // Shutdown workers
    if (workerManager) {
      console.log('⚙️  Shutting down background workers...');
      await workerManager.shutdown();
    }

    // Shutdown queues
    console.log('📋 Shutting down job queues...');
    await shutdownQueues();

    // Shutdown Redis
    console.log('🔴 Shutting down Redis connections...');
    await shutdownRedis();

    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION');
});

start();