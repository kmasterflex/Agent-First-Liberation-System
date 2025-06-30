/**
 * Logger Utility - Centralized logging system
 */

import winston from 'winston';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logs directory path
const logsDir = path.join(__dirname, '../../logs');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
  verbose: 'cyan'
};

// Add colors to winston
winston.addColors(colors);

// Create format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0 && metadata.stack === undefined) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    if (metadata.stack) {
      msg += `\n${metadata.stack}`;
    }
    return msg;
  })
);

// Create transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL ?? 'info'
  })
];

// Add file transport if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Ensure logs directory exists
  import('fs').then(fs => {
    fs.promises.mkdir(logsDir, { recursive: true }).catch(console.error);
  });

  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format
    })
  );

  // Add debug log in development
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'debug.log'),
        level: 'debug',
        format
      })
    );
  }
}

// Create logger instance
export const logger = winston.createLogger({
  levels,
  transports,
  exitOnError: false
});

// Create child loggers for specific modules
export function createLogger(module: string): winston.Logger {
  return logger.child({ module });
}

// Export winston types for use in other modules
export type Logger = winston.Logger;

// Utility functions
export function logError(error: Error | unknown, context?: string): void {
  if (error instanceof Error) {
    logger.error(context ?? error.message, {
      stack: error.stack,
      name: error.name,
      ...error
    });
  } else {
    logger.error(context ?? 'Unknown error', { error });
  }
}

export function logPerformance(operation: string, startTime: number): void {
  const duration = Date.now() - startTime;
  logger.debug(`Performance: ${operation} took ${duration}ms`, {
    operation,
    duration,
    timestamp: new Date().toISOString()
  });
}

// Stream for integrating with other libraries (e.g., Morgan for HTTP logging)
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection:', { reason, promise });
});

// Log startup
logger.info('Logger initialized', {
  logLevel: process.env.LOG_LEVEL || 'info',
  environment: process.env.NODE_ENV || 'production'
});