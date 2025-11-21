import dotenv from 'dotenv';
import { startGrpcServer } from './grpc-server';

// Load environment variables
dotenv.config();

console.log('='.repeat(50));
console.log('Media Upload Consumer Service');
console.log('='.repeat(50));

// Start gRPC server
startGrpcServer();
