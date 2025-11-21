# STDISCM Problem Set 3: Media Upload Service

A TypeScript project demonstrating producer-consumer patterns, network communication (gRPC), and concurrent file I/O through the implementation of a distributed media upload service.

## 📋 Project Overview

This project implements a distributed media upload service with:
- **Producer**: Reads video files and uploads them via gRPC
- **Consumer**: Accepts simultaneous uploads, manages a bounded queue, and saves videos
- **Web GUI**: Browser-based interface for viewing and playing uploaded videos
- **gRPC**: Network communication protocol between producer and consumer

## 🎯 Specifications

The solution must satisfy the following requirements:

**a)** Multiple producer threads/instances, each reading from separate video folders

**b)** Multiple consumer threads processing uploads concurrently

**c)** Bounded queue with leaky bucket design (drops videos when full)

**d)** All uploaded videos saved to a single shared folder (requires synchronization)

**e)** Web GUI that displays videos with:
  - 10-second preview on hover
  - Full playback on click

**f)** Producer and consumer run on different VMs/machines, communicating via gRPC

## 📥 Input

The program accepts the following inputs:

| Input | Description                                            |
| ----- | ------------------------------------------------------ |
| `p`   | Number of producer threads/instances                   |
| `c`   | Number of consumer threads                             |
| `q`   | Maximum queue length (leaky bucket capacity)           |

## 📤 Output

The output includes:

1. **Web GUI** (browser-based)
   - Grid view of all uploaded videos
   - 10-second preview on mouse hover
   - Full video playback on click

2. **Console logs**
   - Upload progress
   - Queue status
   - Videos dropped (when queue is full)

## 🏗️ Project Structure

```
pset3/
├── README.md                # This file
├── .gitignore               # Git ignore rules
├── proto/                   # Shared Protocol Buffer definitions
│   └── video_upload.proto
├── producer/                # Producer service (runs on VM1)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── producer.ts     # Producer logic
│   │   └── grpc-client.ts  # gRPC client
│   └── videos/             # Source video folders
│       ├── folder1/
│       ├── folder2/
│       └── folder3/
├── consumer/                # Consumer service (runs on VM2)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── consumer.ts     # Consumer threads
│   │   ├── grpc-server.ts  # gRPC server
│   │   ├── queue.ts        # Bounded queue implementation
│   │   └── file-handler.ts # Thread-safe file operations
│   └── uploaded-videos/    # Destination folder
└── web-gui/                 # React + Vite frontend
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── App.tsx
        ├── components/
        └── main.tsx
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- FFmpeg (for video preview generation)
- Git (for cloning the repository)

### Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd pset3
```

2. **Install dependencies for all modules**:
```bash
# Install producer dependencies
cd producer
npm install

# Install consumer dependencies
cd ../consumer
npm install

# Install web GUI dependencies
cd ../web-gui
npm install
```

### Building the Project

```bash
# Build producer
cd producer
npm run build

# Build consumer
cd ../consumer
npm run build

# Build web GUI
cd ../web-gui
npm run build
```

## ⚙️ Configuration

### Producer Configuration
Edit `producer/.env`:
```
CONSUMER_HOST=localhost
CONSUMER_PORT=50051
NUM_PRODUCERS=3
VIDEO_FOLDERS=./videos/folder1,./videos/folder2,./videos/folder3
```

### Consumer Configuration
Edit `consumer/.env`:
```
GRPC_PORT=50051
WEB_PORT=3000
NUM_CONSUMERS=4
QUEUE_MAX_SIZE=10
UPLOAD_DIR=./uploaded-videos
```

## 🏃 Running the Program

### Run on Different Machines

**On VM1 (Producer):**
```bash
cd producer
npm start
```

**On VM2 (Consumer):**
```bash
cd consumer
npm start
```

**Access Web GUI:**
Open browser to `http://<VM2_IP>:3000`

### Run Locally (Development)

**Terminal 1 - Consumer:**
```bash
cd consumer
npm run dev
```

**Terminal 2 - Producer:**
```bash
cd producer
npm run dev
```

**Terminal 3 - Web GUI (optional, for development):**
```bash
cd web-gui
npm run dev
```

## 🎁 Bonus Features

- [x] Queue full notification to producers
- [ ] Duplicate detection (MD5 hash)
- [ ] Video compression

## 📦 Deliverables

1. Source code
2. Video Demonstration
3. Build/compilation steps (this README)
4. Slides containing:
   - Key implementation steps
   - Queueing details
   - Producer-consumer concepts applied
   - Synchronization mechanisms used
   - Implementation and justification of gRPC usage      

## 🔧 Development Commands

### Producer
- `npm run dev` - Run in development mode with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run built application

### Consumer
- `npm run dev` - Run in development mode
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run built application
- `npm run serve` - Serve web GUI production build

### Web GUI
- `npm run dev` - Run Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

---

*Problem Set 3 - AY4 Term 3 (SY2025-2026 Term 1) - STDISCM*
