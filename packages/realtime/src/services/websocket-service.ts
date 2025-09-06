import { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { PubSub } from '@google-cloud/pubsub';
import { logger } from '../utils/logger';

export interface WebSocketConnection {
  userId: string;
  tenantId: string;
  socketId: string;
  rooms: string[];
  lastSeen: Date;
  presence: 'online' | 'away' | 'busy';
  location?: {
    page: string;
    tenderId?: string;
    documentId?: string;
  };
}

export interface WebSocketEvent {
  type: string;
  tenantId: string;
  userId?: string;
  room?: string;
  data: any;
  timestamp: Date;
}

export class WebSocketService {
  private io: SocketIOServer;
  private redisClient: any;
  private redisPub: any;
  private redisSub: any;
  private pubSubClient: PubSub;
  private connections = new Map<string, WebSocketConnection>();
  private roomMembers = new Map<string, Set<string>>();

  constructor(private fastify: FastifyInstance) {
    this.initializeRedis();
    this.initializePubSub();
    this.initializeSocketIO();
    this.setupEventHandlers();
  }

  private async initializeRedis(): Promise<void> {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        retryDelayOnFailover: 100,
        retryDelayOnClusterDown: 300,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
      };

      // Create Redis clients for Socket.IO adapter
      this.redisPub = createClient(redisConfig);
      this.redisSub = createClient(redisConfig);

      // Create Redis client for connection tracking
      this.redisClient = createClient({
        ...redisConfig,
        keyPrefix: 'websocket:',
      });

      // Connect all clients
      await Promise.all([
        this.redisPub.connect(),
        this.redisSub.connect(),
        this.redisClient.connect(),
      ]);

      logger.info('Redis clients connected successfully');
    } catch (error) {
      logger.error('Failed to initialize Redis clients:', error);
      throw error;
    }
  }

  private initializePubSub(): void {
    this.pubSubClient = new PubSub({
      projectId: process.env.GCP_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    logger.info('Pub/Sub client initialized');
  }

  private initializeSocketIO(): void {
    this.io = new SocketIOServer(this.fastify.server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      maxHttpBufferSize: 1e6, // 1MB
      allowRequest: this.validateConnection.bind(this),
    });

    // Set up Redis adapter for horizontal scaling
    this.io.adapter(createAdapter(this.redisPub, this.redisSub));

    logger.info('Socket.IO server initialized with Redis adapter');
  }

  private async validateConnection(req: any, callback: Function): Promise<void> {
    try {
      // Extract and validate JWT token
      const token = req.handshake?.auth?.token || 
                   req.handshake?.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return callback(new Error('Authentication required'));
      }

      // Validate token with your auth service
      const user = await this.validateToken(token);
      if (!user) {
        return callback(new Error('Invalid token'));
      }

      // Add user info to socket handshake
      req.handshake.user = user;
      callback(null, true);
    } catch (error) {
      logger.error('Connection validation failed:', error);
      callback(new Error('Authentication failed'));
    }
  }

  private async validateToken(token: string): Promise<any> {
    try {
      // Implementation depends on your JWT validation logic
      // This should call your auth service or validate JWT locally
      const response = await fetch(`${process.env.API_URL}/auth/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Token validation failed');
      }

      return await response.json();
    } catch (error) {
      logger.error('Token validation error:', error);
      return null;
    }
  }

  private setupEventHandlers(): void {
    this.io.on('connection', async (socket) => {
      try {
        const user = socket.handshake.user;
        const connection: WebSocketConnection = {
          userId: user.userId,
          tenantId: user.tenantId,
          socketId: socket.id,
          rooms: [],
          lastSeen: new Date(),
          presence: 'online',
        };

        // Store connection
        this.connections.set(socket.id, connection);
        await this.redisClient.hSet(
          `connections:${user.tenantId}`,
          socket.id,
          JSON.stringify(connection)
        );

        // Join tenant room for tenant-wide broadcasts
        const tenantRoom = `tenant:${user.tenantId}`;
        await socket.join(tenantRoom);
        connection.rooms.push(tenantRoom);

        // Join user room for personal notifications
        const userRoom = `user:${user.userId}`;
        await socket.join(userRoom);
        connection.rooms.push(userRoom);

        logger.info(`User ${user.userId} connected to tenant ${user.tenantId}`);

        // Publish presence event
        await this.publishPresenceEvent(user.userId, user.tenantId, 'online');

        // Set up socket event handlers
        this.setupSocketHandlers(socket, connection);

        // Send welcome message with connection info
        socket.emit('connected', {
          socketId: socket.id,
          userId: user.userId,
          tenantId: user.tenantId,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        logger.error('Connection setup error:', error);
        socket.disconnect();
      }
    });

    // Handle server-wide events
    this.io.on('disconnect', async (socket) => {
      await this.handleDisconnection(socket.id);
    });

    // Monitor connection health
    this.setupHealthMonitoring();
  }

  private setupSocketHandlers(socket: any, connection: WebSocketConnection): void {
    // Join tender room
    socket.on('join:tender', async (data: { tenderId: string }) => {
      try {
        const tenderRoom = `tender:${data.tenderId}`;
        await socket.join(tenderRoom);
        connection.rooms.push(tenderRoom);
        
        // Update location
        connection.location = {
          page: 'tender',
          tenderId: data.tenderId,
        };

        await this.updateConnection(connection);
        
        logger.debug(`User ${connection.userId} joined tender ${data.tenderId}`);
      } catch (error) {
        logger.error('Error joining tender room:', error);
      }
    });

    // Leave tender room
    socket.on('leave:tender', async (data: { tenderId: string }) => {
      try {
        const tenderRoom = `tender:${data.tenderId}`;
        await socket.leave(tenderRoom);
        connection.rooms = connection.rooms.filter(room => room !== tenderRoom);
        
        // Clear location if leaving current tender
        if (connection.location?.tenderId === data.tenderId) {
          connection.location = undefined;
        }

        await this.updateConnection(connection);
        
        logger.debug(`User ${connection.userId} left tender ${data.tenderId}`);
      } catch (error) {
        logger.error('Error leaving tender room:', error);
      }
    });

    // Update presence status
    socket.on('presence:update', async (data: { status: 'online' | 'away' | 'busy', location?: any }) => {
      try {
        connection.presence = data.status;
        connection.location = data.location;
        connection.lastSeen = new Date();

        await this.updateConnection(connection);
        await this.publishPresenceEvent(connection.userId, connection.tenantId, data.status, data.location);
        
        logger.debug(`User ${connection.userId} presence updated to ${data.status}`);
      } catch (error) {
        logger.error('Error updating presence:', error);
      }
    });

    // Handle typing indicators
    socket.on('typing:start', (data: { tenderId: string, documentId?: string }) => {
      const room = data.documentId ? `document:${data.documentId}` : `tender:${data.tenderId}`;
      socket.to(room).emit('typing:start', {
        userId: connection.userId,
        tenantId: connection.tenantId,
        ...data,
      });
    });

    socket.on('typing:stop', (data: { tenderId: string, documentId?: string }) => {
      const room = data.documentId ? `document:${data.documentId}` : `tender:${data.tenderId}`;
      socket.to(room).emit('typing:stop', {
        userId: connection.userId,
        tenantId: connection.tenantId,
        ...data,
      });
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      connection.lastSeen = new Date();
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      logger.info(`User ${connection.userId} disconnected: ${reason}`);
      await this.handleDisconnection(socket.id);
    });
  }

  private async updateConnection(connection: WebSocketConnection): Promise<void> {
    this.connections.set(connection.socketId, connection);
    await this.redisClient.hSet(
      `connections:${connection.tenantId}`,
      connection.socketId,
      JSON.stringify(connection)
    );
  }

  private async handleDisconnection(socketId: string): Promise<void> {
    try {
      const connection = this.connections.get(socketId);
      if (!connection) return;

      // Remove from local storage
      this.connections.delete(socketId);

      // Remove from Redis
      await this.redisClient.hDel(`connections:${connection.tenantId}`, socketId);

      // Publish offline presence event
      await this.publishPresenceEvent(connection.userId, connection.tenantId, 'offline');

      logger.info(`User ${connection.userId} disconnected and cleaned up`);
    } catch (error) {
      logger.error('Error handling disconnection:', error);
    }
  }

  // Public methods for broadcasting events
  public async broadcastTenderUpdate(event: {
    tenderId: string;
    tenantId: string;
    userId: string;
    eventType: string;
    data: any;
  }): Promise<void> {
    try {
      // Broadcast to tender room
      this.io.to(`tender:${event.tenderId}`).emit('tender:updated', {
        ...event,
        timestamp: new Date().toISOString(),
      });

      // Publish to Pub/Sub for other instances
      await this.publishEvent('tender-events', event);
      
      logger.debug(`Tender update broadcasted: ${event.tenderId}`);
    } catch (error) {
      logger.error('Error broadcasting tender update:', error);
    }
  }

  public async broadcastDocumentUpdate(event: {
    documentId: string;
    tenderId: string;
    tenantId: string;
    userId: string;
    eventType: string;
    data: any;
  }): Promise<void> {
    try {
      // Broadcast to tender room (documents belong to tenders)
      this.io.to(`tender:${event.tenderId}`).emit('document:uploaded', {
        ...event,
        timestamp: new Date().toISOString(),
      });

      // Publish to Pub/Sub
      await this.publishEvent('document-events', event);
      
      logger.debug(`Document update broadcasted: ${event.documentId}`);
    } catch (error) {
      logger.error('Error broadcasting document update:', error);
    }
  }

  public async broadcastComment(event: {
    resourceId: string;
    resourceType: 'tender' | 'document';
    tenantId: string;
    userId: string;
    data: any;
  }): Promise<void> {
    try {
      const room = `${event.resourceType}:${event.resourceId}`;
      
      this.io.to(room).emit('comment:added', {
        ...event,
        timestamp: new Date().toISOString(),
      });

      // Publish to Pub/Sub
      await this.publishEvent('collaboration-events', event);
      
      logger.debug(`Comment broadcasted to ${room}`);
    } catch (error) {
      logger.error('Error broadcasting comment:', error);
    }
  }

  public async sendNotification(notification: {
    userId: string;
    tenantId: string;
    type: string;
    title: string;
    message: string;
    data?: any;
  }): Promise<void> {
    try {
      // Send to specific user
      this.io.to(`user:${notification.userId}`).emit('notification:new', {
        ...notification,
        timestamp: new Date().toISOString(),
      });

      // Publish to Pub/Sub
      await this.publishEvent('notification-events', notification);
      
      logger.debug(`Notification sent to user ${notification.userId}`);
    } catch (error) {
      logger.error('Error sending notification:', error);
    }
  }

  private async publishEvent(topic: string, event: any): Promise<void> {
    try {
      const message = {
        data: Buffer.from(JSON.stringify(event)),
        attributes: {
          tenantId: event.tenantId,
          userId: event.userId || '',
          timestamp: new Date().toISOString(),
        },
      };

      await this.pubSubClient.topic(topic).publish(message.data, message.attributes);
    } catch (error) {
      logger.error(`Error publishing to ${topic}:`, error);
    }
  }

  private async publishPresenceEvent(
    userId: string, 
    tenantId: string, 
    status: string, 
    location?: any
  ): Promise<void> {
    try {
      const event = {
        userId,
        tenantId,
        status,
        location,
        timestamp: new Date().toISOString(),
      };

      await this.publishEvent('presence-events', event);
    } catch (error) {
      logger.error('Error publishing presence event:', error);
    }
  }

  private setupHealthMonitoring(): void {
    // Clean up stale connections every 5 minutes
    setInterval(async () => {
      try {
        const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
        const staleConnections: string[] = [];

        for (const [socketId, connection] of this.connections) {
          if (connection.lastSeen < staleThreshold) {
            staleConnections.push(socketId);
          }
        }

        for (const socketId of staleConnections) {
          await this.handleDisconnection(socketId);
        }

        if (staleConnections.length > 0) {
          logger.info(`Cleaned up ${staleConnections.length} stale connections`);
        }
      } catch (error) {
        logger.error('Error in connection cleanup:', error);
      }
    }, 5 * 60 * 1000);

    // Log connection statistics every minute
    setInterval(() => {
      const stats = {
        totalConnections: this.connections.size,
        totalRooms: this.roomMembers.size,
        redisConnected: this.redisClient?.status === 'ready',
      };
      
      logger.info('WebSocket stats:', stats);
    }, 60 * 1000);
  }

  // Health check endpoint
  public getHealthStatus(): any {
    return {
      status: 'healthy',
      connections: this.connections.size,
      rooms: this.roomMembers.size,
      redis: this.redisClient?.status,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down WebSocket service...');
      
      // Disconnect all clients
      this.io.disconnectSockets();
      
      // Close Redis connections
      await Promise.all([
        this.redisClient?.quit(),
        this.redisPub?.quit(),
        this.redisSub?.quit(),
      ]);
      
      logger.info('WebSocket service shutdown complete');
    } catch (error) {
      logger.error('Error during WebSocket service shutdown:', error);
    }
  }
}

// Singleton instance
let webSocketService: WebSocketService;

export const initializeWebSocketService = (fastify: FastifyInstance): WebSocketService => {
  if (!webSocketService) {
    webSocketService = new WebSocketService(fastify);
  }
  return webSocketService;
};

export const getWebSocketService = (): WebSocketService => {
  if (!webSocketService) {
    throw new Error('WebSocket service not initialized');
  }
  return webSocketService;
};