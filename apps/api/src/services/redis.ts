import { Redis } from 'ioredis';
import { Queue, QueueEvents, Worker, Job } from 'bullmq';
import { createLogger, logError, logInfo, logSuccess } from '../utils/logger';

const logger = createLogger('REDIS');

// Redis connection configuration
const getRedisConfig = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);
  
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
    db: 0,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4, // IPv4
    // Connection pool settings
    maxLoadingTimeout: 5000,
    enableAutoPipelining: true,
    // Reconnect settings
    retryCount: 5,
    retryDelayOnError: 1000,
  };
};

// Create Redis connections for different purposes
const redisConfig = getRedisConfig();

// Main Redis client for general operations
export const redis = new Redis(redisConfig);

// Separate connection for BullMQ (recommended for better performance)
export const bullmqRedis = new Redis({
  ...redisConfig,
  // BullMQ specific optimizations
  maxRetriesPerRequest: null, // BullMQ handles retries
  enableReadyCheck: false,
  lazyConnect: true,
});

// Connection event handlers
redis.on('connect', () => {
  logSuccess('CONNECTION', 'Redis connected');
});

redis.on('ready', () => {
  logSuccess('CONNECTION', 'Redis ready');
});

redis.on('error', (error) => {
  logError('CONNECTION', 'Redis error', error);
});

redis.on('close', () => {
  logInfo('CONNECTION', 'Redis connection closed');
});

bullmqRedis.on('connect', () => {
  logSuccess('CONNECTION', 'BullMQ Redis connected');
});

bullmqRedis.on('error', (error) => {
  logError('CONNECTION', 'BullMQ Redis error', error);
});

// Redis health check
export async function checkRedisHealth(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
  try {
    const ping = await redis.ping();
    if (ping === 'PONG') {
      const info = await redis.info('memory');
      const usedMemory = info.match(/used_memory:(\d+)/)?.[1];
      
      return {
        status: 'healthy',
        details: usedMemory ? `Memory usage: ${Math.round(parseInt(usedMemory) / 1024 / 1024)}MB` : undefined,
      };
    }
    return { status: 'unhealthy', details: 'Ping failed' };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
}

// Redis statistics
export async function getRedisStats() {
  try {
    const [info, keyCount, memoryInfo] = await Promise.all([
      redis.info('stats'),
      redis.dbsize(),
      redis.info('memory'),
    ]);

    // Parse stats
    const stats = info.split('\r\n').reduce((acc, line) => {
      const [key, value] = line.split(':');
      if (key && value) {
        acc[key] = isNaN(Number(value)) ? value : Number(value);
      }
      return acc;
    }, {} as Record<string, string | number>);

    // Parse memory info
    const memoryStats = memoryInfo.split('\r\n').reduce((acc, line) => {
      const [key, value] = line.split(':');
      if (key && value) {
        acc[key] = isNaN(Number(value)) ? value : Number(value);
      }
      return acc;
    }, {} as Record<string, string | number>);

    return {
      keyCount,
      totalConnections: stats.total_connections_received || 0,
      commandsProcessed: stats.total_commands_processed || 0,
      usedMemory: Math.round((memoryStats.used_memory as number) / 1024 / 1024), // MB
      maxMemory: Math.round((memoryStats.maxmemory as number) / 1024 / 1024) || 'unlimited', // MB
      timestamp: new Date(),
    };
  } catch (error) {
    logError('STATS', 'Failed to get Redis stats', error as Error);
    return null;
  }
}

// Cache utilities
export class CacheManager {
  private static readonly DEFAULT_TTL = 3600; // 1 hour

  // Instance methods for compatibility
  async ping(): Promise<void> {
    await redis.ping();
  }

  async flushAll(): Promise<void> {
    await redis.flushall();
  }

  async reconnect(): Promise<void> {
    await redis.disconnect();
    await redis.connect();
  }

  // Static methods (existing)
  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logError('CACHE', `Cache get error for key ${key}`, error as Error);
      return null;
    }
  }

  static async set<T = any>(key: string, value: T, ttl: number = CacheManager.DEFAULT_TTL): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      const result = await redis.setex(key, ttl, serialized);
      return result === 'OK';
    } catch (error) {
      logError('CACHE', `Cache set error for key ${key}`, error as Error);
      return false;
    }
  }

  static async del(key: string): Promise<boolean> {
    try {
      const result = await redis.del(key);
      return result > 0;
    } catch (error) {
      logError('CACHE', `Cache delete error for key ${key}`, error as Error);
      return false;
    }
  }

  static async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result > 0;
    } catch (error) {
      logError('CACHE', `Cache exists error for key ${key}`, error as Error);
      return false;
    }
  }

  static async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length === 0) return 0;
      
      const result = await redis.del(...keys);
      return result;
    } catch (error) {
      logError('CACHE', `Cache invalidate pattern error for pattern ${pattern}`, error as Error);
      return 0;
    }
  }

  // Tenant-specific cache keys
  static tenantKey(tenantId: string, key: string): string {
    return `tenant:${tenantId}:${key}`;
  }

  static userKey(userId: string, key: string): string {
    return `user:${userId}:${key}`;
  }

  static tenderKey(tenderId: string, key: string): string {
    return `tender:${tenderId}:${key}`;
  }
}

// Session management
export class SessionManager {
  private static readonly SESSION_TTL = 86400; // 24 hours
  private static readonly REFRESH_TTL = 604800; // 7 days

  static async createSession(userId: string, sessionData: any): Promise<string> {
    const sessionId = `session:${userId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    await Promise.all([
      redis.setex(sessionId, SessionManager.SESSION_TTL, JSON.stringify(sessionData)),
      redis.sadd(`user:${userId}:sessions`, sessionId),
    ]);

    return sessionId;
  }

  static async getSession(sessionId: string): Promise<any | null> {
    try {
      const data = await redis.get(sessionId);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logError('SESSION', 'Session get error', error as Error);
      return null;
    }
  }

  static async updateSession(sessionId: string, sessionData: any): Promise<boolean> {
    try {
      const ttl = await redis.ttl(sessionId);
      if (ttl <= 0) return false;

      const result = await redis.setex(sessionId, ttl, JSON.stringify(sessionData));
      return result === 'OK';
    } catch (error) {
      logError('SESSION', 'Session update error', error as Error);
      return false;
    }
  }

  static async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const userId = sessionId.split(':')[1];
      
      await Promise.all([
        redis.del(sessionId),
        redis.srem(`user:${userId}:sessions`, sessionId),
      ]);

      return true;
    } catch (error) {
      logError('SESSION', 'Session delete error', error as Error);
      return false;
    }
  }

  static async deleteUserSessions(userId: string): Promise<number> {
    try {
      const sessions = await redis.smembers(`user:${userId}:sessions`);
      if (sessions.length === 0) return 0;

      await Promise.all([
        redis.del(...sessions),
        redis.del(`user:${userId}:sessions`),
      ]);

      return sessions.length;
    } catch (error) {
      logError('SESSION', 'User sessions delete error', error as Error);
      return 0;
    }
  }
}

// Rate limiting utilities
export class RateLimiter {
  static async checkLimit(key: string, limit: number, window: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.expire(key, window);
      }

      const ttl = await redis.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);

      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime,
      };
    } catch (error) {
      logError('RATE_LIMIT', 'Rate limit check error', error as Error);
      // Fail open - allow the request if Redis is down
      return {
        allowed: true,
        remaining: limit,
        resetTime: Date.now() + (window * 1000),
      };
    }
  }

  static async resetLimit(key: string): Promise<boolean> {
    try {
      const result = await redis.del(key);
      return result > 0;
    } catch (error) {
      logError('RATE_LIMIT', 'Rate limit reset error', error as Error);
      return false;
    }
  }
}

// Distributed locks
export class DistributedLock {
  static async acquire(lockKey: string, ttl: number = 10000, retryDelay: number = 100, maxRetries: number = 10): Promise<string | null> {
    const lockValue = `${Date.now()}-${Math.random()}`;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await redis.set(lockKey, lockValue, 'PX', ttl, 'NX');
        if (result === 'OK') {
          return lockValue;
        }
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } catch (error) {
        logError('LOCK', 'Lock acquire error', error as Error);
        return null;
      }
    }
    
    return null;
  }

  static async release(lockKey: string, lockValue: string): Promise<boolean> {
    try {
      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await redis.eval(script, 1, lockKey, lockValue);
      return result === 1;
    } catch (error) {
      logError('LOCK', 'Lock release error', error as Error);
      return false;
    }
  }

  static async extend(lockKey: string, lockValue: string, ttl: number): Promise<boolean> {
    try {
      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("PEXPIRE", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      
      const result = await redis.eval(script, 1, lockKey, lockValue, ttl);
      return result === 1;
    } catch (error) {
      logError('LOCK', 'Lock extend error', error as Error);
      return false;
    }
  }
}

// Graceful shutdown
export async function shutdownRedis(): Promise<void> {
  try {
    logInfo('SHUTDOWN', 'Shutting down Redis connections...');
    
    await Promise.all([
      redis.quit(),
      bullmqRedis.quit(),
    ]);
    
    logSuccess('SHUTDOWN', 'Redis connections closed');
  } catch (error) {
    logError('SHUTDOWN', 'Error shutting down Redis', error as Error);
  }
}

// Export default redis instance
export default redis;