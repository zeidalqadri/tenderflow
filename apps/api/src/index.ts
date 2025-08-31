// TenderFlow Fastify API Server Entry Point
import { createServer, ServerConfig } from './server';

async function start() {
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3001'),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: (process.env.NODE_ENV as any) || 'development',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    corsOrigin: process.env.CORS_ORIGIN || true,
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/tenderflow',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    s3Bucket: process.env.S3_BUCKET || 'tenderflow-documents',
    s3Region: process.env.S3_REGION || 'us-east-1',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  };

  try {
    const server = await createServer(config);
    
    await server.listen({ 
      port: config.port, 
      host: config.host 
    });
    
    console.log(`
🚀 TenderFlow API Server is running!

📍 Server: http://${config.host}:${config.port}
📚 API Docs: http://${config.host}:${config.port}/docs
🌍 Environment: ${config.nodeEnv}
📊 Log Level: ${config.logLevel}

🔗 Endpoints:
  - Auth: http://${config.host}:${config.port}/api/v1/auth
  - Tenders: http://${config.host}:${config.port}/api/v1/tenders
  - Documents: http://${config.host}:${config.port}/api/v1/documents
  - Bids: http://${config.host}:${config.port}/api/v1/bids
  - Submissions: http://${config.host}:${config.port}/api/v1/submissions
  - Exports: http://${config.host}:${config.port}/api/v1/exports

🔧 Use Ctrl+C to stop the server
    `);
  } catch (err) {
    console.error('❌ Error starting server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

start();