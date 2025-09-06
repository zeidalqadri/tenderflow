import { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { queueEvents } from './queue';
import { prisma } from '../database/client';
import { CacheManager } from './redis';
import { createLogger, logError, logInfo, logSuccess } from '../utils/logger';

const logger = createLogger('SOCKETIO');

// Client connection information
interface ClientConnection {
  id: string;
  socketId: string;
  userId: string;
  tenantId: string;
  subscriptions: Set<string>;
  metadata: Record<string, any>;
}

// Socket.IO Service
export class SocketIOService {
  private io: SocketIOServer;
  private clients: Map<string, ClientConnection> = new Map();

  constructor(private fastify: FastifyInstance) {
    // Initialize Socket.IO with Fastify
    this.io = this.fastify.io;
    this.setupSocketHandlers();
    this.setupQueueEventListeners();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      const clientId = this.generateClientId();
      
      // Extract user info from socket handshake
      const userId = socket.handshake.auth?.userId || 'anonymous';
      const tenantId = socket.handshake.auth?.tenantId || 'default';
      
      const client: ClientConnection = {
        id: clientId,
        socketId: socket.id,
        userId,
        tenantId,
        subscriptions: new Set(),
        metadata: {},
      };

      this.clients.set(socket.id, client);
      
      logInfo('CONNECTION', `Socket.IO client connected: ${socket.id}`, { userId, tenantId });

      // Join tenant room
      socket.join(`tenant:${tenantId}`);
      socket.join(`user:${userId}`);

      // Send welcome message
      socket.emit('connected', {
        clientId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      // Handle subscriptions
      socket.on('subscribe:scraper', () => {
        socket.join('scraper:updates');
        client.subscriptions.add('scraper');
        logInfo('SUBSCRIPTION', `Client ${socket.id} subscribed to scraper updates`);
      });

      socket.on('subscribe:tender', (tenderId: string) => {
        socket.join(`tender:${tenderId}`);
        client.subscriptions.add(`tender:${tenderId}`);
        logInfo('SUBSCRIPTION', `Client ${socket.id} subscribed to tender ${tenderId}`);
      });

      socket.on('unsubscribe:tender', (tenderId: string) => {
        socket.leave(`tender:${tenderId}`);
        client.subscriptions.delete(`tender:${tenderId}`);
      });

      // Handle search
      socket.on('search:tenders', async (query: string) => {
        try {
          // Implement search logic here
          const results = await prisma.tender.findMany({
            where: {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
              tenantId,
            },
            take: 20,
          });
          
          socket.emit('search:results', results);
        } catch (error) {
          socket.emit('search:error', { message: 'Search failed' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.clients.delete(socket.id);
        logInfo('CONNECTION', `Socket.IO client disconnected: ${socket.id}`);
      });

      // Handle errors
      socket.on('error', (error) => {
        logError('CONNECTION', `Socket error for ${socket.id}`, error);
      });
    });
  }

  // Send tender update notifications
  public notifyTenderUpdate(tenderId: string, tenantId: string, updateData: any): void {
    this.io.to(`tenant:${tenantId}`).emit('tender:update', {
      id: tenderId,
      ...updateData,
      timestamp: new Date().toISOString(),
    });
  }

  // Send new tender notifications
  public notifyNewTender(tender: any): void {
    this.io.to(`tenant:${tender.tenantId}`).emit('tender:new', {
      ...tender,
      isNew: true,
      timestamp: new Date().toISOString(),
    });
  }

  // Send scraper progress updates
  public notifyScrapingProgress(jobId: string, tenantId: string, progress: any): void {
    this.io.to('scraper:updates').emit('scraper:status', {
      type: 'progress',
      jobId,
      ...progress,
      timestamp: new Date().toISOString(),
    });
  }

  // Send scraper completion
  public notifyScrapingComplete(jobId: string, result: any): void {
    this.io.to('scraper:updates').emit('scraper:completed', {
      jobId,
      ...result,
      timestamp: new Date().toISOString(),
    });
  }

  // Send scraper error
  public notifyScrapingError(jobId: string, error: string): void {
    this.io.to('scraper:updates').emit('scraper:error', {
      jobId,
      message: error,
      timestamp: new Date().toISOString(),
    });
  }

  // Send queue statistics updates
  public notifyQueueStats(stats: any): void {
    this.io.emit('statistics:update', stats);
  }

  // Helper methods
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupQueueEventListeners(): void {
    // Listen to scraping queue events
    queueEvents.scraping.on('progress', async ({ jobId, data }) => {
      logInfo('PROGRESS', `Scraping progress: ${jobId} - ${data}%`);
      
      // Cache the progress
      await CacheManager.set(`job:${jobId}:progress`, data, 300);

      // Notify via Socket.IO
      this.io.to('scraper:updates').emit('scraper:status', {
        type: 'progress',
        jobId,
        progress: data,
        timestamp: new Date().toISOString(),
      });
    });

    queueEvents.scraping.on('completed', async ({ jobId, returnvalue }) => {
      logSuccess('SCRAPING', `Scraping completed: ${jobId}`);

      // Cache the result
      await CacheManager.set(`job:${jobId}:result`, returnvalue, 3600);

      // Notify via Socket.IO
      this.notifyScrapingComplete(jobId, returnvalue);
    });

    queueEvents.scraping.on('failed', async ({ jobId, failedReason }) => {
      logError('SCRAPING', `Scraping failed: ${jobId}`, new Error(failedReason));

      // Cache the failure
      await CacheManager.set(`job:${jobId}:error`, failedReason, 3600);

      // Notify via Socket.IO
      this.notifyScrapingError(jobId, failedReason);
    });

    // Listen to processing queue events
    queueEvents.processing.on('completed', ({ jobId, returnvalue }) => {
      logSuccess('PROCESSING', `Processing completed: ${jobId}`);
      // You can add more specific notifications here
    });
  }

  // Get connection statistics
  public getStats(): {
    totalClients: number;
    clientsByRoom: Record<string, number>;
  } {
    const rooms = this.io.sockets.adapter.rooms;
    const clientsByRoom: Record<string, number> = {};
    
    for (const [roomName, socketIds] of rooms) {
      // Skip individual socket rooms
      if (!roomName.startsWith('tenant:') && !roomName.startsWith('user:') && !roomName.startsWith('tender:')) {
        continue;
      }
      clientsByRoom[roomName] = socketIds.size;
    }

    return {
      totalClients: this.clients.size,
      clientsByRoom,
    };
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    logInfo('SHUTDOWN', 'Shutting down Socket.IO service...');

    // Disconnect all clients
    this.io.emit('server:shutdown', { message: 'Server shutting down' });
    this.io.disconnectSockets(true);
    
    this.clients.clear();

    logSuccess('SHUTDOWN', 'Socket.IO service shut down');
  }
}

export default SocketIOService;