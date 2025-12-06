import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as crypto from 'crypto';
import { VideoChunk, UploadResponse, QueueStatusResponse } from '../../proto/types';
import { VideoQueue } from './queue';
import { Logger } from './logger';
import { VideoRegistry } from './video-registry';

const logger = new Logger('gRPC-Server');
const registry = VideoRegistry.getInstance();

// Initialize queue
const queueMaxSize = parseInt(process.env.QUEUE_MAX_SIZE || '10', 10);
export const videoQueue = VideoQueue.getInstance(queueMaxSize);

const PROTO_PATH = path.join(__dirname, '../../proto/video_upload.proto');

/**
 * Handle streaming video upload from producer
 */
function uploadVideo(call: grpc.ServerReadableStream<VideoChunk, UploadResponse>, callback: grpc.sendUnaryData<UploadResponse>) {
  const chunks: Buffer[] = [];
  let filename = '';
  let producerId = 0;
  let expectedHash = '';

  call.on('data', (chunk: VideoChunk) => {
    // Handle Metadata Chunk (first chunk only)
    if (chunk.metadata) {
      filename = chunk.metadata.filename;
      producerId = chunk.metadata.producerId;
      if (chunk.metadata.md5Hash) {
        expectedHash = chunk.metadata.md5Hash;
      }
      logger.debug(`[Producer ${producerId}] Received metadata for ${filename}`);
      return; // Exit early, do not try to read .data
    }

    // Handle Data Chunk (all subsequent chunks)
    if (chunk.data) {
      chunks.push(chunk.data);
      logger.debug(`[Producer ${producerId}] Received chunk ${chunk.chunk_number} for ${filename}`);
    } else {
      logger.warn(`Received chunk with no metadata and no data`);
    }

    if (chunk.is_last) {
      logger.debug(`[Producer ${producerId}] Received last chunk for ${filename}, reassembling...`);
    }
  });

  call.on('end', () => {
    try {
      // Reassemble video from chunks
      const completeVideo = Buffer.concat(chunks);

      // Verify MD5 hash
      if (expectedHash) {
        const calculatedHash = crypto.createHash('md5').update(completeVideo).digest('hex');
        if (calculatedHash !== expectedHash) {
          logger.error(`[Producer ${producerId}] Hash mismatch for ${filename}. Expected: ${expectedHash}, Calculated: ${calculatedHash}`);
          const response: UploadResponse = {
            success: false,
            message: 'Data integrity check failed: MD5 hash mismatch',
            video_id: '',
            queue_full: false
          };
          callback(null, response);
          return;
        }
        logger.debug(`[Producer ${producerId}] MD5 hash verified for ${filename}`);

        // Check for duplicates BEFORE queueing
        if (registry.isDuplicate(expectedHash)) {
          const existingEntry = registry.getEntry(expectedHash);
          const uploadTime = existingEntry?.uploadedAt
            ? new Date(existingEntry.uploadedAt).toLocaleString()
            : 'unknown time';
          logger.warn(`[Producer ${producerId}] Duplicate detected for ${filename}`);
          logger.warn(`[Producer ${producerId}] Original: ${existingEntry?.filename} uploaded at ${uploadTime}`);

          const response: UploadResponse = {
            success: false,
            message: `Duplicate video detected. Original file: ${existingEntry?.filename} (uploaded at ${uploadTime})`,
            video_id: '',
            queue_full: false
          };
          callback(null, response);
          return;
        }
      } else {
        logger.warn(`[Producer ${producerId}] No MD5 hash provided for ${filename}, skipping verification and duplicate check`);
      }

      // Attempt to enqueue the video
      const jobAdded = videoQueue.enqueue({
        filename: filename,
        data: completeVideo,
        producerId: producerId,
        md5Hash: expectedHash || undefined
      });

      if (!jobAdded) {
        logger.warn(`[Producer ${producerId}] Queue full, rejecting ${filename}`);
        const response: UploadResponse = {
          success: false,
          message: 'Server queue is full, please try again later',
          video_id: '',
          queue_full: true
        };
        callback(null, response);
        return;
      }

      // Register the hash after successful enqueue
      if (expectedHash) {
        registry.register(expectedHash, filename, 'pending', producerId);
      }

      logger.info(`[Producer ${producerId}] Queued ${filename} for processing`);

      const response: UploadResponse = {
        success: true,
        message: `Video queued successfully`,
        video_id: 'pending', // ID will be generated when processing
        queue_full: false
      };

      callback(null, response);
    } catch (error) {
      logger.error(`Error processing upload:`, error);

      const errorResponse: UploadResponse = {
        success: false,
        message: `Failed to process video: ${error}`,
        video_id: '',
        queue_full: false
      };

      callback(null, errorResponse);
    }
  });

  call.on('error', (error) => {
    logger.error(`Error during upload:`, error);
  });
}

/**
 * Handle queue status request
 */
function checkQueueStatus(call: grpc.ServerUnaryCall<any, QueueStatusResponse>, callback: grpc.sendUnaryData<QueueStatusResponse>) {
  const response: QueueStatusResponse = {
    current_size: videoQueue.getSize(),
    max_size: videoQueue.getMaxSize(),
    is_full: videoQueue.isFull(),
    utilization: videoQueue.getUtilization()
  };

  callback(null, response);
}

/**
 * Start the gRPC server
 */
export function startGrpcServer(): void {
  // Load proto file
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,  // Allow auto-conversion: snake_case → camelCase
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
  const videoUploadProto = protoDescriptor.video_upload;

  // Create server
  const server = new grpc.Server();

  // Add service implementation
  server.addService(videoUploadProto.VideoUploadService.service, {
    UploadVideo: uploadVideo,
    CheckQueueStatus: checkQueueStatus
  });

  // Bind and start server
  const port = process.env.GRPC_PORT || '50051';
  const bindAddress = `0.0.0.0:${port}`;

  server.bindAsync(
    bindAddress,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        logger.error(`Failed to start gRPC server:`, error);
        return;
      }

      logger.info(`gRPC server running on port ${port}`);
      logger.info(`Upload directory: ${process.env.UPLOAD_DIR || './uploaded-videos'}`);
    }
  );
}
