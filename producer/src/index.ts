import { GrpcClient } from './grpc-client';
import dotenv from 'dotenv';
import { Logger } from './logger';
import { discoverVideoFiles, calculateFileHash, createFileStream, getVideoMetadata, sleep } from './utils';
import * as path from 'path';

const logger = new Logger('ProducerMain');

dotenv.config();

const HOST = process.env.CONSUMER_HOST || 'localhost';
const PORT = process.env.CONSUMER_PORT || 50051;
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '1048576', 10);
const NUM_PRODUCERS = parseInt(process.env.NUM_PRODUCERS || '1', 10);
const VIDEO_FOLDERS = (process.env.VIDEO_FOLDERS || './videos').split(',');
const MAX_RETRIES = 3;

async function startProducerThread(id: number, folders: string[]) {
  const logger = new Logger(`Producer-${id}`);
  logger.info(`Starting Producer Thread ${id}`);
  logger.info(`Assigned folders: ${folders.join(', ')}`);

  try {
    const client = new GrpcClient(HOST, PORT);
    logger.info('gRPC Client initialized successfully.');

    logger.info('Waiting for consumer to be ready...');
    try {
      await client.waitForReady(5000); // Wait up to 5 seconds
      logger.info('Consumer is ready.');
    } catch (err) {
      logger.error('Failed to connect to consumer within deadline.', err);
      return;
    }

    // Discover videos
    const allVideos: string[] = [];
    for (const folder of folders) {
      try {
        // Resolve relative paths
        const resolvedFolder = path.resolve(folder);
        const videos = await discoverVideoFiles(resolvedFolder);
        allVideos.push(...videos);
      } catch (err) {
        logger.warn(`Failed to discover videos in ${folder}: ${err}`);
      }
    }

    if (allVideos.length === 0) {
      logger.warn('No videos found to upload.');
      return;
    }

    logger.info(`Found ${allVideos.length} videos to upload.`);

    for (const videoPath of allVideos) {
      logger.info(`Processing video: ${videoPath}`);
      try {
        const hash = await calculateFileHash(videoPath);
        const meta = getVideoMetadata(videoPath);

        logger.info(`Uploading ${meta.filename} (Size: ${meta.sizeBytes}, Hash: ${hash})`);

        // Retry loop for handling queue full
        let uploadSuccess = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            await new Promise<void>((resolve, reject) => {
              const stream = client.uploadVideo({
                filename: meta.filename,
                producerId: id,
                md5Hash: hash
              }, (err, response) => {
                if (err) {
                  logger.error(`Upload failed for ${meta.filename}:`, err);
                  reject(err);
                } else if (response && response.queue_full) {
                  logger.warn(`Queue full for ${meta.filename}`);
                  reject(new Error('QUEUE_FULL'));
                } else {
                  logger.info(`Upload success for ${meta.filename}: ${JSON.stringify(response)}`);
                  resolve();
                }
              });

              const fileStream = createFileStream(videoPath, { highWaterMark: CHUNK_SIZE });
              let chunkNum = 0;

              fileStream.on('data', (chunk: Buffer | string) => {
                const dataBuffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
                chunkNum++;
                const canWrite = stream.write({
                  filename: meta.filename,
                  data: dataBuffer,
                  chunk_number: chunkNum,
                  is_last: false,
                  producer_id: id,
                  md5_hash: hash
                });

                if (!canWrite) {
                  fileStream.pause();
                  stream.once('drain', () => fileStream.resume());
                }
              });

              fileStream.on('end', () => {
                // Send final empty chunk with is_last=true
                stream.write({
                  filename: meta.filename,
                  data: Buffer.alloc(0),
                  chunk_number: chunkNum + 1,
                  is_last: true,
                  producer_id: id,
                  md5_hash: hash
                });
                stream.end();
              });

              fileStream.on('error', (err) => {
                logger.error(`File read error for ${videoPath}:`, err);
                stream.end();
                reject(err);
              });
            });

            uploadSuccess = true;
            break; // Success, exit retry loop

          } catch (err: any) {
            if (err.message === 'QUEUE_FULL') {
              if (attempt < MAX_RETRIES) {
                // Exponential backoff
                const delay = Math.pow(2, attempt - 1) * 1000;
                logger.warn(`Queue full. Retrying upload for ${meta.filename} in ${delay}ms (Attempt ${attempt}/${MAX_RETRIES})`);
                await sleep(delay);
              } else {
                logger.error(`Failed to upload ${meta.filename} after ${MAX_RETRIES} attempts due to full queue.`);
              }
            } else {
              logger.error(`Fatal error uploading ${meta.filename}:`, err);
              break;
            }
          }
        }

        if (!uploadSuccess) {
          logger.warn(`Skipping ${meta.filename} due to upload failure.`);
        }

      } catch (err) {
        logger.error(`Failed to upload ${videoPath}:`, err);
        // Continue to next video
      }
    }

    logger.info('All videos processed.');

  } catch (error) {
    logger.error('Failed to initialize producer:', error);
  }
}

async function main() {
  const mainLogger = new Logger('Main');
  mainLogger.info('Starting Multi-threaded Producer System...');
  mainLogger.info(`Configuration: Host=${HOST}, Port=${PORT}, ChunkSize=${CHUNK_SIZE}, NumProducers=${NUM_PRODUCERS}`);

  // Distribute folders among producers
  const producerFolders: string[][] = Array.from({ length: NUM_PRODUCERS }, () => []);
  VIDEO_FOLDERS.forEach((folder, index) => {
    const producerIndex = index % NUM_PRODUCERS;
    producerFolders[producerIndex].push(folder);
  });

  const producerPromises = [];
  for (let i = 0; i < NUM_PRODUCERS; i++) {
    const producerId = i + 1;
    const folders = producerFolders[i];
    if (folders.length > 0) {
      producerPromises.push(startProducerThread(producerId, folders));
    } else {
      mainLogger.warn(`Producer ${producerId} has no assigned folders and will not start.`);
    }
  }

  await Promise.all(producerPromises);
  mainLogger.info('All producer threads completed.');
}

main();
