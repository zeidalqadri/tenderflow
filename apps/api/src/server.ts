// TenderFlow Fastify API Server
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifySocketIO from 'fastify-socket.io';
import multipart from '@fastify/multipart';

import jwtPlugin from './plugins/jwt';
import tenantPlugin from './plugins/tenant';
import aclPlugin from './plugins/acl';
import errorHandlerPlugin from './plugins/error-handler';
import auditPlugin from './plugins/audit';
import validationPlugin from './plugins/validation';

import authRoutes from './routes/auth';
import tenderRoutes from './routes/tenders';
import assigneeRoutes from './routes/assignees';
import permissionRoutes from './routes/permissions';
import alertRoutes from './routes/alerts';
import documentRoutes from './routes/documents';
import bidRoutes from './routes/bids';
import submissionRoutes from './routes/submissions';
import outcomeRoutes from './routes/outcomes';
import exportRoutes from './routes/exports';
import { scraperRoutes } from './routes/scraper';
import securityRoutes from './routes/security';
import queueRoutes from './routes/queues';

export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  corsOrigin: string | string[] | boolean;
  jwtSecret: string;
  databaseUrl: string;
  redisUrl: string;
  s3Bucket: string;
  s3Region: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
}

export async function createServer(config: ServerConfig) {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
            remotePort: req.socket.remotePort,
            headers: {
              'user-agent': req.headers['user-agent'],
              'content-type': req.headers['content-type'],
              authorization: req.headers.authorization ? '[Redacted]' : undefined,
            },
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
            headers: {
              'content-type': res.headers['content-type'],
              'content-length': res.headers['content-length'],
            },
          };
        },
      },
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: config.nodeEnv === 'test',
  });

  // Trust proxy for proper IP handling
  await fastify.register(import('@fastify/sensible'));

  // Security middleware
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  // CORS configuration
  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Tenant-ID',
    ],
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    skipOnError: true,
    addHeaders: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false,
      'retry-after': false,
    },
  });

  // File upload support
  await fastify.register(multipart, {
    limits: {
      fieldNameSize: 100, // Max field name size in bytes
      fieldSize: 100, // Max field value size in bytes
      fields: 10, // Max number of non-file fields
      fileSize: 50 * 1024 * 1024, // 50MB limit for files
      files: 5, // Max number of file fields
      headerPairs: 2000, // Max number of header key=>value pairs
    },
  });

  // Socket.IO support
  await fastify.register(fastifySocketIO, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
    },
    path: '/ws',
  });

  // Swagger documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'TenderFlow API',
        description: 'Complete API for TenderFlow tender management system',
        version: '1.0.0',
        contact: {
          name: 'TenderFlow Team',
          email: 'support@tenderflow.com',
        },
      },
      servers: [
        {
          url: `http://${config.host}:${config.port}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Core plugins
  await fastify.register(errorHandlerPlugin);
  await fastify.register(validationPlugin);
  await fastify.register(jwtPlugin, { secret: config.jwtSecret });
  await fastify.register(tenantPlugin);
  await fastify.register(aclPlugin);
  await fastify.register(auditPlugin);
  
  // Development: Conditionally load auth bypass for development
  if (config.nodeEnv === 'development' && process.env.DISABLE_AUTH === 'true') {
    const devAuthBypass = await import('./plugins/dev-auth-bypass');
    await fastify.register(devAuthBypass.default, { disableAuth: true });
  }

  // Health check routes
  fastify.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    };
  });

  fastify.get('/health/ready', {
    schema: {
      description: 'Readiness check endpoint with dependency health checks',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            checks: {
              type: 'object',
              properties: {
                database: { type: 'object' },
                redis: { type: 'object' },
                queues: { type: 'object' },
              },
            },
          },
        },
      },
    },
  }, async () => {
    const results: any = {
      database: { status: 'unknown' },
      redis: { status: 'unknown' },
      queues: { status: 'unknown' },
    };

    try {
      // Check database health
      const { healthCheck } = await import('./database/client');
      results.database = await healthCheck();
    } catch (error) {
      results.database = {
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Database check failed',
      };
    }

    try {
      // Check Redis health
      const { checkRedisHealth } = await import('./services/redis');
      results.redis = await checkRedisHealth();
    } catch (error) {
      results.redis = {
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Redis check failed',
      };
    }

    try {
      // Check queue health
      const { checkQueuesHealth } = await import('./services/queue');
      results.queues = await checkQueuesHealth();
    } catch (error) {
      results.queues = {
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Queue check failed',
      };
    }

    const overallStatus = Object.values(results).every(
      (check: any) => check.status === 'healthy'
    ) ? 'ready' : 'not ready';

    return {
      status: overallStatus,
      checks: results,
    };
  });

  // Security monitoring routes (registered first for priority)
  await fastify.register(securityRoutes, { prefix: '/api/v1' });

  // API routes
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(tenderRoutes, { prefix: '/api/v1/tenders' });
  await fastify.register(assigneeRoutes, { prefix: '/api/v1/tenders' });
  await fastify.register(permissionRoutes, { prefix: '/api/v1/tenders' });
  await fastify.register(alertRoutes, { prefix: '/api/v1/alerts' });
  await fastify.register(documentRoutes, { prefix: '/api/v1/documents' });
  await fastify.register(bidRoutes, { prefix: '/api/v1/bids' });
  await fastify.register(submissionRoutes, { prefix: '/api/v1/submissions' });
  await fastify.register(outcomeRoutes, { prefix: '/api/v1/outcomes' });
  await fastify.register(exportRoutes, { prefix: '/api/v1/exports' });
  await fastify.register(scraperRoutes, { prefix: '/api/v1/scraper' });
  await fastify.register(queueRoutes);

  // Socket.IO service setup
  const SocketIOService = (await import('./services/socketio')).SocketIOService;
  const socketIOService = new SocketIOService(fastify);

  // Store Socket.IO service in fastify instance for access in routes
  fastify.decorate('socketio', socketIOService);

  // Global error handling
  fastify.setNotFoundHandler({
    preHandler: fastify.rateLimit(),
  }, function (request, reply) {
    reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404,
    });
  });

  return fastify;
}