import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { QueueStatusResponse } from '../../proto/types';

const PROTO_PATH = path.join(__dirname, '../../proto/video_upload.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const videoUploadPackage = protoDescriptor.video_upload;

export class GrpcConsumerClient {
  private client: any;

  constructor(host: string, port: number | string) {
    const address = `${host}:${port}`;
    this.client = new videoUploadPackage.VideoUploadService(
      address,
      grpc.credentials.createInsecure()
    );
    console.log(`gRPC Consumer client connected to ${address}`);
  }

  // Call CheckQueueStatus RPC
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

  // Optional: wait for gRPC server readiness
  public waitForReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      this.client.waitForReady(deadline, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
