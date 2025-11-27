import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { VideoChunk, UploadResponse, QueueStatusResponse } from '../../proto/types';
import { VideoQueue } from './queue';
import { Logger } from './logger';

const logger = new Logger('gRPC-Server');

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

  call.on('data', (chunk: VideoChunk) => {
    filename = chunk.filename;
    producerId = chunk.producer_id;
    chunks.push(chunk.data);

    logger.debug(`[Producer ${producerId}] Received chunk ${chunk.chunk_number} for ${filename}`);

    if (chunk.is_last) {
      logger.debug(`[Producer ${producerId}] Received last chunk for ${filename}, reassembling...`);
    }
  });

  call.on('end', () => {
    try {
      // Reassemble video from chunks
      const completeVideo = Buffer.concat(chunks);

      // Attempt to enqueue the video
      const jobAdded = videoQueue.enqueue({
        filename: filename,
        data: completeVideo,
        producerId: producerId
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
 * Note: Returns placeholder values until Issue #10 (Bounded Queue) is implemented
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
    keepCase: true,
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
