import { GrpcClient } from './grpc-client';
import dotenv from 'dotenv';
import { Logger } from './logger';

const logger = new Logger('ProducerMain');

dotenv.config();

const HOST = process.env.CONSUMER_HOST || 'localhost';
const PORT = process.env.CONSUMER_PORT || 50051;

async function main() {
  logger.info('Starting Producer...');

  try {
    const client = new GrpcClient(HOST, PORT);
    logger.info('gRPC Client initialized successfully.');

    // Just a smoke test to see if methods exist
    if (typeof client.uploadVideo === 'function' && typeof client.checkQueueStatus === 'function') {
      logger.info('Client methods verified.');
    }

  } catch (error) {
    logger.error('Failed to initialize producer:', error);
  }
}

main();
