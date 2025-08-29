// TenderFlow Fastify API Server
import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

// Basic health check route
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Placeholder for API routes
fastify.get('/', async () => {
  return { message: 'TenderFlow API Server', version: '1.0.0' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('TenderFlow API server listening on http://localhost:3001');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();