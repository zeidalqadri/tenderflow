import winston from 'winston';

export interface LoggerConfig {
  level: string;
  service: string;
  nodeEnv: 'development' | 'production' | 'test';
}

class Logger {
  private static instance: winston.Logger;
  
  public static getInstance(config?: LoggerConfig): winston.Logger {
    if (!Logger.instance) {
      Logger.instance = Logger.createLogger(config || {
        level: process.env.LOG_LEVEL || 'info',
        service: process.env.SERVICE_NAME || 'tenderflow-api',
        nodeEnv: (process.env.NODE_ENV as any) || 'development'
      });
    }
    return Logger.instance;
  }

  private static createLogger(config: LoggerConfig): winston.Logger {
    const { combine, timestamp, errors, json, simple, colorize, printf } = winston.format;

    // Custom format for development
    const devFormat = printf(({ level, message, timestamp, service, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
    });

    // Production format (structured JSON)
    const prodFormat = combine(
      timestamp(),
      errors({ stack: true }),
      json()
    );

    // Development format (colorized, readable)
    const developmentFormat = combine(
      timestamp({ format: 'HH:mm:ss' }),
      colorize(),
      errors({ stack: true }),
      devFormat
    );

    const transports: winston.transport[] = [];

    // Console transport
    if (config.nodeEnv !== 'test') {
      transports.push(new winston.transports.Console({
        format: config.nodeEnv === 'production' ? prodFormat : developmentFormat
      }));
    }

    // File transports for production
    if (config.nodeEnv === 'production') {
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: prodFormat
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: prodFormat
        })
      );
    }

    return winston.createLogger({
      level: config.level,
      defaultMeta: { service: config.service },
      transports,
      // Don't exit on handled exceptions
      exitOnError: false
    });
  }

  public static createChildLogger(context: string, config?: LoggerConfig): winston.Logger {
    const parentLogger = Logger.getInstance(config);
    return parentLogger.child({ context });
  }
}

// Export the logger instance and a function to create child loggers
export const logger = Logger.getInstance();

export const createLogger = (context: string, config?: LoggerConfig): winston.Logger => {
  return Logger.createChildLogger(context, config);
};

// Convenience functions for common logging patterns
export const logStartup = (service: string, config: any) => {
  const startupLogger = createLogger('STARTUP');
  startupLogger.info(`🚀 Starting ${service}`, { config: { ...config, jwtSecret: '[REDACTED]' } });
};

export const logShutdown = (service: string, signal?: string) => {
  const shutdownLogger = createLogger('SHUTDOWN');
  if (signal) {
    shutdownLogger.info(`🛑 Received ${signal}, shutting down ${service} gracefully`);
  } else {
    shutdownLogger.info(`🔌 Shutting down ${service}`);
  }
};

export const logError = (context: string, message: string, error?: Error) => {
  const errorLogger = createLogger(context);
  errorLogger.error(`❌ ${message}`, { error: error?.message, stack: error?.stack });
};

export const logSuccess = (context: string, message: string, meta?: any) => {
  const successLogger = createLogger(context);
  successLogger.info(`✅ ${message}`, meta);
};

export const logWarning = (context: string, message: string, meta?: any) => {
  const warningLogger = createLogger(context);
  warningLogger.warn(`⚠️  ${message}`, meta);
};

export const logInfo = (context: string, message: string, meta?: any) => {
  const infoLogger = createLogger(context);
  infoLogger.info(`ℹ️  ${message}`, meta);
};

export const logDebug = (context: string, message: string, meta?: any) => {
  const debugLogger = createLogger(context);
  debugLogger.debug(`🔍 ${message}`, meta);
};

export default logger;