import dotenv from 'dotenv';
import { startGrpcServer, videoQueue } from './grpc-server';
import { startApiServer } from './api-server';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

const logger = new Logger('Worker');

// Load environment variables
dotenv.config();

console.log('='.repeat(50));
console.log('Media Upload Consumer Service');
console.log('='.repeat(50));

// Start gRPC server
startGrpcServer();

// Start Express API server

startApiServer();

// Worker loop to process videos
async function processQueue() {
  const uploadDir = process.env.UPLOAD_DIR || './uploaded-videos';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  while (true) {
    const job = videoQueue.dequeue();

    if (job) {
      try {
        logger.info(`Processing job for ${job.filename} (Producer ${job.producerId})`);

        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const savedFilename = `${timestamp}_${job.filename}`;
        const filepath = path.join(uploadDir, savedFilename);

        fs.writeFileSync(filepath, job.data);
        logger.info(`Saved ${savedFilename}`);
      } catch (error) {
        logger.error(`Error processing job:`, error);
      }
    } else {
      // Wait before checking again if queue is empty
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Start worker
processQueue().catch(err => logger.error('Worker crashed:', err));
