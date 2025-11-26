import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { UploadResponse, QueueStatusResponse, VideoChunk } from '../../proto/types';
import { Logger } from './logger';

const logger = new Logger('GrpcClient');

logger.info(`Current working directory: ${process.cwd()}`);
const PROTO_PATH = path.resolve(process.cwd(), '../proto/video_upload.proto');
logger.info(`Resolved PROTO_PATH: ${PROTO_PATH}`);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const videoUploadPackage = protoDescriptor.video_upload;

export class GrpcClient {
  private client: any;

  constructor(host: string, port: number | string) {
    const address = `${host}:${port}`;
    this.client = new videoUploadPackage.VideoUploadService(
      address,
      grpc.credentials.createInsecure()
    );
    logger.info(`gRPC Client connected to ${address}`);
  }

  public uploadVideo(
    meta: { filename: string; producerId: number; md5Hash: string },
    onComplete?: (err: Error | null, response?: UploadResponse) => void
  ): grpc.ClientWritableStream<VideoChunk> {
    const stream = this.client.UploadVideo((error: grpc.ServiceError | null, response: UploadResponse) => {
      if (error) {
        logger.error('UploadVideo error:', error);
        if (onComplete) onComplete(error);
      } else {
        logger.info(`UploadVideo response: ${JSON.stringify(response)}`);
        if (onComplete) onComplete(null, response);
      }
    });
    return stream;
  }

  public checkQueueStatus(): Promise<QueueStatusResponse> {
    return new Promise((resolve, reject) => {
      this.client.CheckQueueStatus({}, (error: grpc.ServiceError | null, response: QueueStatusResponse) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  public waitForReady(deadline: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadlineDate = new Date(Date.now() + deadline);
      this.client.waitForReady(deadlineDate, (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
