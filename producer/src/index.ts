import { GrpcClient } from './grpc-client';
import dotenv from 'dotenv';

dotenv.config();

const HOST = process.env.CONSUMER_HOST || 'localhost';
const PORT = process.env.CONSUMER_PORT || 50051;

async function main() {
  console.log('Starting Producer...');

  try {
    const client = new GrpcClient(HOST, PORT);
    console.log('gRPC Client initialized successfully.');

    // Just a smoke test to see if methods exist
    if (typeof client.uploadVideo === 'function' && typeof client.checkQueueStatus === 'function') {
      console.log('Client methods verified.');
    }

  } catch (error) {
    console.error('Failed to initialize producer:', error);
  }
}

main();
