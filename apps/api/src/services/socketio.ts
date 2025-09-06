import { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { queueEvents } from './queue';
import { prisma } from '../database/client';
import { CacheManager } from './redis';
import { createLogger, logError, logInfo, logSuccess } from '../utils/logger';
import { monitoringAgent } from './monitoring-agent';
import { systemControl } from './system-control';
import type { RemediationAction } from '@tenderflow/shared';

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
    this.setupMonitoringEventListeners();
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

      // Monitoring event handlers
      socket.on('monitoring:subscribe', () => {
        socket.join('monitoring:updates');
        client.subscriptions.add('monitoring');
        logInfo('MONITORING', `Client ${socket.id} subscribed to monitoring updates`);
        
        // Send initial health status
        const health = monitoringAgent.getHealth();
        socket.emit('health:update', health);
        
        // Send recent metrics
        const metrics = monitoringAgent.getMetrics(1);
        if (metrics.length > 0) {
          socket.emit('metrics:update', metrics[0]);
        }
      });

      socket.on('monitoring:unsubscribe', () => {
        socket.leave('monitoring:updates');
        client.subscriptions.delete('monitoring');
      });

      socket.on('monitoring:refresh:health', () => {
        const health = monitoringAgent.getHealth();
        socket.emit('health:update', health);
      });

      socket.on('monitoring:refresh:component', async (data: { componentId: string }) => {
        await monitoringAgent.refreshComponent(data.componentId);
        const component = monitoringAgent.getComponentHealth(data.componentId);
        if (component) {
          socket.emit('component:update', component);
        }
      });

      socket.on('monitoring:remediation:execute', async (data: { actionId: string }) => {
        try {
          const result = await systemControl.executeRemediation(data.actionId);
          socket.emit('remediation:complete', result);
        } catch (error) {
          socket.emit('remediation:error', { 
            actionId: data.actionId,
            error: error instanceof Error ? error.message : 'Remediation failed'
          });
        }
      });

      socket.on('monitoring:control:restart', async (data: { componentId: string }) => {
        try {
          await systemControl.restartComponent(data.componentId);
          socket.emit('control:success', { 
            action: 'restart',
            componentId: data.componentId 
          });
        } catch (error) {
          socket.emit('control:error', { 
            action: 'restart',
            componentId: data.componentId,
            error: error instanceof Error ? error.message : 'Restart failed'
          });
        }
      });

      socket.on('monitoring:control:scale', async (data: { componentId: string, replicas: number }) => {
        try {
          await systemControl.scaleComponent(data.componentId, data.replicas);
          socket.emit('control:success', { 
            action: 'scale',
            componentId: data.componentId,
            replicas: data.replicas
          });
        } catch (error) {
          socket.emit('control:error', { 
            action: 'scale',
            componentId: data.componentId,
            error: error instanceof Error ? error.message : 'Scale failed'
          });
        }
      });

      socket.on('monitoring:control:clear_cache', async () => {
        try {
          await systemControl.clearCache();
          socket.emit('control:success', { action: 'clear_cache' });
        } catch (error) {
          socket.emit('control:error', { 
            action: 'clear_cache',
            error: error instanceof Error ? error.message : 'Cache clear failed'
          });
        }
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

  private setupMonitoringEventListeners(): void {
    // Listen to monitoring agent events
    monitoringAgent.on('health:update', (health) => {
      this.io.to('monitoring:updates').emit('health:update', health);
    });

    monitoringAgent.on('component:update', (component) => {
      this.io.to('monitoring:updates').emit('component:update', component);
    });

    monitoringAgent.on('alert:new', (alert) => {
      this.io.to('monitoring:updates').emit('alert:new', alert);
    });

    monitoringAgent.on('error:new', (error) => {
      this.io.to('monitoring:updates').emit('error:new', error);
    });

    monitoringAgent.on('metrics:update', (metrics) => {
      this.io.to('monitoring:updates').emit('metrics:update', metrics);
    });

    // Start monitoring if not already started
    monitoringAgent.start(30000); // 30 second interval
  }

  // Send monitoring update
  public notifyMonitoringUpdate(type: string, data: any): void {
    this.io.to('monitoring:updates').emit(type, data);
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    logInfo('SHUTDOWN', 'Shutting down Socket.IO service...');

    // Stop monitoring agent
    monitoringAgent.stop();

    // Disconnect all clients
    this.io.emit('server:shutdown', { message: 'Server shutting down' });
    this.io.disconnectSockets(true);
    
    this.clients.clear();

    logSuccess('SHUTDOWN', 'Socket.IO service shut down');
  }
}

export default SocketIOService;