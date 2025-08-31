// Minimal test server to verify Fastify setup
import Fastify from 'fastify';

async function startTest() {
  const fastify = Fastify({
    logger: {
      level: 'info'
    }
  });

  // Simple health check route
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Test route with database connection
  fastify.get('/test/db', async (request, reply) => {
    try {
      const { PrismaClient } = await import('./generated/prisma');
      const prisma = new PrismaClient();
      
      const tenantCount = await prisma.tenant.count();
      await prisma.$disconnect();
      
      return { 
        status: 'ok', 
        database: 'connected',
        tenantCount 
      };
    } catch (error) {
      fastify.log.error(error, 'Database connection failed');
      return reply.status(500).send({ 
        status: 'error', 
        message: 'Database connection failed',
        error: error.message 
      });
    }
  });

  try {
    const address = await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log(`✅ Test server is running on ${address}`);
    console.log(`📊 Health check: http://localhost:3001/health`);
    console.log(`🗄️  Database test: http://localhost:3001/test/db`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

startTest();