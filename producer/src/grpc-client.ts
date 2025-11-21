import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { UploadResponse, QueueStatusResponse, VideoChunk } from '../../proto/types';

const PROTO_PATH = path.resolve(__dirname, '../../proto/video_upload.proto');

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
    console.log(`gRPC Client connected to ${address}`);
  }

  public uploadVideo(meta: { filename: string; producerId: number; md5Hash?: string }): grpc.ClientWritableStream<VideoChunk> {
    const stream = this.client.UploadVideo((error: grpc.ServiceError | null, response: UploadResponse) => {
      if (error) {
        console.error('UploadVideo error:', error);
      } else {
        console.log('UploadVideo response:', response);
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
}
