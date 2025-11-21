import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { VideoChunk, UploadResponse, QueueStatusResponse } from '../../proto/types';

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

    console.log(`[Producer ${producerId}] Received chunk ${chunk.chunk_number} for ${filename}`);

    if (chunk.is_last) {
      console.log(`[Producer ${producerId}] Received last chunk for ${filename}, reassembling...`);
    }
  });

  call.on('end', () => {
    try {
      // Reassemble video from chunks
      const completeVideo = Buffer.concat(chunks);

      // Save to uploaded-videos directory
      const uploadDir = process.env.UPLOAD_DIR || './uploaded-videos';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const videoId = uuidv4();
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const savedFilename = `${timestamp}_${filename}`;
      const filepath = path.join(uploadDir, savedFilename);

      fs.writeFileSync(filepath, completeVideo);

      console.log(`[Producer ${producerId}] Successfully saved ${filename} as ${savedFilename} (${completeVideo.length} bytes)`);

      const response: UploadResponse = {
        success: true,
        message: `Video uploaded successfully`,
        video_id: videoId,
        queue_full: false // Placeholder for Issue #10
      };

      callback(null, response);
    } catch (error) {
      console.error(`[ERROR] Error saving video:`, error);

      const errorResponse: UploadResponse = {
        success: false,
        message: `Failed to save video: ${error}`,
        video_id: '',
        queue_full: false
      };

      callback(null, errorResponse);
    }
  });

  call.on('error', (error) => {
    console.error(`[ERROR] Error during upload:`, error);
  });
}

/**
 * Handle queue status request
 * Note: Returns placeholder values until Issue #10 (Bounded Queue) is implemented
 */
function checkQueueStatus(call: grpc.ServerUnaryCall<any, QueueStatusResponse>, callback: grpc.sendUnaryData<QueueStatusResponse>) {
  // Placeholder implementation for Issue #10
  const maxSize = parseInt(process.env.QUEUE_MAX_SIZE || '10', 10);

  const response: QueueStatusResponse = {
    current_size: 0,
    max_size: maxSize,
    is_full: false,
    utilization: 0.0
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
        console.error(`[ERROR] Failed to start gRPC server:`, error);
        return;
      }

      console.log(`gRPC server running on port ${port}`);
      console.log(`Upload directory: ${process.env.UPLOAD_DIR || './uploaded-videos'}`);
    }
  );
}
