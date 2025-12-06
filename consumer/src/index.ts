import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

import { startGrpcServer, videoQueue } from './grpc-server';
import { startApiServer } from './api-server';
import { Logger } from './logger';
import { createConsumerPool, shutdownConsumers } from './consumer';

const logger = new Logger('Main');

console.log('='.repeat(50));
console.log('Media Upload Consumer Service');
console.log('='.repeat(50));

// Get number of consumers from environment
const numConsumers = parseInt(process.env.NUM_CONSUMERS || '4', 10);
console.log(`Configuration: ${numConsumers} consumers, queue max size: ${process.env.QUEUE_MAX_SIZE || '10'}`);
console.log('='.repeat(50));

// Start gRPC server
startGrpcServer();

// Start Express API server
startApiServer();

// Start consumer pool
createConsumerPool(numConsumers, videoQueue);

// Graceful shutdown handler
let isShuttingDown = false;

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, initiating graceful shutdown...`);

  try {
    await shutdownConsumers(videoQueue);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
