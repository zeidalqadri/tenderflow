import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getWebSocketService } from '../services/websocket-service';
import { z } from 'zod';
import { toJsonSchema } from '../utils/schema-converter';

// Pub/Sub message schemas
const PubSubMessageSchema = z.object({
  data: z.string(),
  attributes: z.record(z.string()).optional(),
  messageId: z.string(),
  publishTime: z.string(),
});

const TenderEventSchema = z.object({
  eventType: z.enum(['CREATED', 'UPDATED', 'DELETED', 'STATE_CHANGED', 'DEADLINE_APPROACHING']),
  tenderId: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  timestamp: z.number(),
  data: z.record(z.any()).optional(),
});

const DocumentEventSchema = z.object({
  eventType: z.enum(['UPLOADED', 'PROCESSED', 'DELETED', 'OCR_COMPLETED', 'VIRUS_SCAN_COMPLETED']),
  documentId: z.string(),
  tenderId: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  timestamp: z.number(),
  data: z.record(z.any()).optional(),
});

const CollaborationEventSchema = z.object({
  eventType: z.enum(['COMMENT_ADDED', 'COMMENT_UPDATED', 'COMMENT_DELETED', 'USER_ASSIGNED', 'USER_UNASSIGNED']),
  resourceId: z.string(),
  resourceType: z.enum(['TENDER', 'DOCUMENT', 'BID']),
  tenantId: z.string(),
  userId: z.string(),
  timestamp: z.number(),
  data: z.string().optional(),
});

const NotificationEventSchema = z.object({
  notificationId: z.string(),
  recipientId: z.string(),
  tenantId: z.string(),
  type: z.enum(['TENDER_DEADLINE', 'NEW_COMMENT', 'DOCUMENT_PROCESSED', 'USER_ASSIGNED', 'SYSTEM_ALERT']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  title: z.string(),
  message: z.string(),
  timestamp: z.number(),
  data: z.string().optional(),
});

const PresenceEventSchema = z.object({
  userId: z.string(),
  tenantId: z.string(),
  status: z.enum(['ONLINE', 'OFFLINE', 'AWAY', 'BUSY']),
  location: z.object({
    page: z.string(),
    tenderId: z.string().optional(),
    documentId: z.string().optional(),
  }).optional(),
  timestamp: z.number(),
});

const webSocketRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Health check endpoint for WebSocket service
  fastify.get('/health/websocket', {
    schema: {
      description: 'WebSocket service health check',
      tags: ['WebSocket', 'Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            connections: { type: 'number' },
            rooms: { type: 'number' },
            redis: { type: 'string' },
            uptime: { type: 'number' },
            memory: {
              type: 'object',
              properties: {
                rss: { type: 'number' },
                heapTotal: { type: 'number' },
                heapUsed: { type: 'number' },
                external: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const wsService = getWebSocketService();
      const health = wsService.getHealthStatus();
      
      return reply.code(200).send(health);
    } catch (error) {
      fastify.log.error('WebSocket health check failed:', error);
      return reply.code(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Service unavailable',
      });
    }
  });

  // Pub/Sub webhook endpoints for cross-instance messaging
  
  // Tender events handler
  fastify.post('/pubsub/tender-events', {
    schema: {
      description: 'Handle tender events from Pub/Sub',
      tags: ['WebSocket', 'PubSub'],
      body: toJsonSchema(z.object({
        message: PubSubMessageSchema,
      })),
      response: {
        200: { type: 'object', properties: { received: { type: 'boolean' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    try {
      const { message } = request.body as any;
      
      // Decode the message data
      const eventData = JSON.parse(Buffer.from(message.data, 'base64').toString());
      const validatedEvent = TenderEventSchema.parse(eventData);
      
      const wsService = getWebSocketService();
      await wsService.broadcastTenderUpdate({
        tenderId: validatedEvent.tenderId,
        tenantId: validatedEvent.tenantId,
        userId: validatedEvent.userId,
        eventType: validatedEvent.eventType,
        data: validatedEvent.data,
      });
      
      fastify.log.debug('Processed tender event from Pub/Sub:', validatedEvent.tenderId);
      return reply.send({ received: true });
      
    } catch (error) {
      fastify.log.error('Error processing tender event:', error);
      return reply.code(400).send({ error: 'Failed to process event' });
    }
  });

  // Document events handler
  fastify.post('/pubsub/document-events', {
    schema: {
      description: 'Handle document events from Pub/Sub',
      tags: ['WebSocket', 'PubSub'],
      body: toJsonSchema(z.object({
        message: PubSubMessageSchema,
      })),
      response: {
        200: { type: 'object', properties: { received: { type: 'boolean' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    try {
      const { message } = request.body as any;
      
      const eventData = JSON.parse(Buffer.from(message.data, 'base64').toString());
      const validatedEvent = DocumentEventSchema.parse(eventData);
      
      const wsService = getWebSocketService();
      await wsService.broadcastDocumentUpdate({
        documentId: validatedEvent.documentId,
        tenderId: validatedEvent.tenderId,
        tenantId: validatedEvent.tenantId,
        userId: validatedEvent.userId,
        eventType: validatedEvent.eventType,
        data: validatedEvent.data,
      });
      
      fastify.log.debug('Processed document event from Pub/Sub:', validatedEvent.documentId);
      return reply.send({ received: true });
      
    } catch (error) {
      fastify.log.error('Error processing document event:', error);
      return reply.code(400).send({ error: 'Failed to process event' });
    }
  });

  // Collaboration events handler
  fastify.post('/pubsub/collaboration-events', {
    schema: {
      description: 'Handle collaboration events from Pub/Sub',
      tags: ['WebSocket', 'PubSub'],
      body: toJsonSchema(z.object({
        message: PubSubMessageSchema,
      })),
      response: {
        200: { type: 'object', properties: { received: { type: 'boolean' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    try {
      const { message } = request.body as any;
      
      const eventData = JSON.parse(Buffer.from(message.data, 'base64').toString());
      const validatedEvent = CollaborationEventSchema.parse(eventData);
      
      const wsService = getWebSocketService();
      await wsService.broadcastComment({
        resourceId: validatedEvent.resourceId,
        resourceType: validatedEvent.resourceType.toLowerCase() as 'tender' | 'document',
        tenantId: validatedEvent.tenantId,
        userId: validatedEvent.userId,
        data: validatedEvent.data ? JSON.parse(validatedEvent.data) : {},
      });
      
      fastify.log.debug('Processed collaboration event from Pub/Sub:', validatedEvent.resourceId);
      return reply.send({ received: true });
      
    } catch (error) {
      fastify.log.error('Error processing collaboration event:', error);
      return reply.code(400).send({ error: 'Failed to process event' });
    }
  });

  // Notification events handler
  fastify.post('/pubsub/notification-events', {
    schema: {
      description: 'Handle notification events from Pub/Sub',
      tags: ['WebSocket', 'PubSub'],
      body: toJsonSchema(z.object({
        message: PubSubMessageSchema,
      })),
      response: {
        200: { type: 'object', properties: { received: { type: 'boolean' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    try {
      const { message } = request.body as any;
      
      const eventData = JSON.parse(Buffer.from(message.data, 'base64').toString());
      const validatedEvent = NotificationEventSchema.parse(eventData);
      
      const wsService = getWebSocketService();
      await wsService.sendNotification({
        userId: validatedEvent.recipientId,
        tenantId: validatedEvent.tenantId,
        type: validatedEvent.type,
        title: validatedEvent.title,
        message: validatedEvent.message,
        data: validatedEvent.data ? JSON.parse(validatedEvent.data) : undefined,
      });
      
      fastify.log.debug('Processed notification event from Pub/Sub:', validatedEvent.notificationId);
      return reply.send({ received: true });
      
    } catch (error) {
      fastify.log.error('Error processing notification event:', error);
      return reply.code(400).send({ error: 'Failed to process event' });
    }
  });

  // Presence events handler (for cross-instance presence sync)
  fastify.post('/pubsub/presence-events', {
    schema: {
      description: 'Handle presence events from Pub/Sub',
      tags: ['WebSocket', 'PubSub'],
      body: toJsonSchema(z.object({
        message: PubSubMessageSchema,
      })),
      response: {
        200: { type: 'object', properties: { received: { type: 'boolean' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    try {
      const { message } = request.body as any;
      
      const eventData = JSON.parse(Buffer.from(message.data, 'base64').toString());
      const validatedEvent = PresenceEventSchema.parse(eventData);
      
      // Broadcast presence update to tenant room
      const wsService = getWebSocketService();
      const io = (wsService as any).io; // Access the Socket.IO instance
      
      io.to(`tenant:${validatedEvent.tenantId}`).emit('user:presence', {
        userId: validatedEvent.userId,
        status: validatedEvent.status,
        location: validatedEvent.location,
        timestamp: new Date(validatedEvent.timestamp).toISOString(),
      });
      
      fastify.log.debug('Processed presence event from Pub/Sub:', validatedEvent.userId);
      return reply.send({ received: true });
      
    } catch (error) {
      fastify.log.error('Error processing presence event:', error);
      return reply.code(400).send({ error: 'Failed to process event' });
    }
  });

  // API endpoints for manual event triggering (for testing and admin use)
  
  // Trigger tender update manually
  fastify.post('/api/events/tender', {
    schema: {
      description: 'Manually trigger tender update event',
      tags: ['WebSocket', 'Events'],
      security: [{ bearerAuth: [] }],
      body: toJsonSchema(z.object({
        tenderId: z.string(),
        eventType: z.string(),
        data: z.record(z.any()).optional(),
      })),
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { tenderId, eventType, data } = request.body as any;
    
    const wsService = getWebSocketService();
    await wsService.broadcastTenderUpdate({
      tenderId,
      tenantId: request.tenant!.id,
      userId: request.user!.userId,
      eventType,
      data,
    });
    
    return reply.send({ success: true });
  });

  // Trigger notification manually
  fastify.post('/api/events/notification', {
    schema: {
      description: 'Manually send notification',
      tags: ['WebSocket', 'Events'],
      security: [{ bearerAuth: [] }],
      body: toJsonSchema(z.object({
        recipientId: z.string(),
        type: z.string(),
        title: z.string(),
        message: z.string(),
        data: z.record(z.any()).optional(),
      })),
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const { recipientId, type, title, message, data } = request.body as any;
    
    const wsService = getWebSocketService();
    await wsService.sendNotification({
      userId: recipientId,
      tenantId: request.tenant!.id,
      type,
      title,
      message,
      data,
    });
    
    return reply.send({ success: true });
  });

  // Get connection statistics
  fastify.get('/api/stats/connections', {
    schema: {
      description: 'Get WebSocket connection statistics',
      tags: ['WebSocket', 'Stats'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            totalConnections: { type: 'number' },
            tenantConnections: { type: 'number' },
            activeRooms: { type: 'array', items: { type: 'string' } },
            serverInfo: {
              type: 'object',
              properties: {
                uptime: { type: 'number' },
                memory: { type: 'object' },
                cpu: { type: 'object' },
              },
            },
          },
        },
      },
    },
    preHandler: [fastify.authenticate, fastify.requireTenant],
  }, async (request, reply) => {
    const wsService = getWebSocketService();
    const health = wsService.getHealthStatus();
    
    // Filter connections by tenant (if needed)
    // This would require extending the WebSocket service to provide tenant-specific stats
    
    return reply.send({
      totalConnections: health.connections,
      tenantConnections: health.connections, // TODO: Filter by tenant
      activeRooms: [], // TODO: Get active rooms list
      serverInfo: {
        uptime: health.uptime,
        memory: health.memory,
        cpu: process.cpuUsage(),
      },
    });
  });

  // WebSocket connection debugging endpoint
  fastify.get('/api/debug/connections', {
    schema: {
      description: 'Debug WebSocket connections (admin only)',
      tags: ['WebSocket', 'Debug'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            connections: { type: 'array' },
            redisStatus: { type: 'string' },
            pubsubTopics: { type: 'array' },
          },
        },
      },
    },
    preHandler: [fastify.authenticate, fastify.requireRole(['admin'])],
  }, async (request, reply) => {
    const wsService = getWebSocketService();
    
    // This would require extending the WebSocket service to expose debug info
    const debugInfo = {
      connections: [], // TODO: Get sanitized connection list
      redisStatus: (wsService as any).redisClient?.status || 'unknown',
      pubsubTopics: [
        'tender-events',
        'document-events',
        'collaboration-events',
        'notification-events',
        'presence-events',
      ],
    };
    
    return reply.send(debugInfo);
  });
};

export default webSocketRoutes;