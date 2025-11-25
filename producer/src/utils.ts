import * as fs from "fs";
import * as path from "path";


// The video meta data to return. 
export interface VideoMetadata {
    filePath: string;
    filename: string;
    extension: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
    modifiedAt: Date;
}

// Checker for the video file extensions.
export function isVideoFile(filename: string): boolean {
    const videoExtensions = new Set([
        ".mp4",
        ".mkv",
        ".mov",
        ".avi",
    ]);
    const ext = path.extname(filename).toLowerCase();
    return videoExtensions.has(ext);
}

// Recursivley scan folders for video files of the defined extensions.
export async function discoverVideoFiles(folderPath: string): Promise<string[]> {
    const results: string[] = [];

    async function walk(dir: string) {
        let dirents: fs.Dirent[];
        try {
            dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return; // ignore unreadable directories
        }

        for (const dirent of dirents) {
            const full = path.join(dir, dirent.name);
            if (dirent.isDirectory()) {
                // skip node_modules and hidden directories to improve perf
                if (dirent.name === "node_modules" || dirent.name.startsWith(".")) continue;
                await walk(full);
            } else if (dirent.isFile()) {
                if (isVideoFile(dirent.name)) results.push(full);
            }
        }
    }

    await walk(path.resolve(folderPath));
    return results;
}

/**
 * Synchronously gather basic metadata about a video file.
 * This intentionally keeps metadata to filesystem-level values (size, times, ext) only.
 */
export function getVideoMetadata(filePath: string): VideoMetadata {
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const extension = path.extname(filename).toLowerCase();

    function lookupMime(ext: string): string {
        switch (ext) {
            case ".mp4":
                return "video/mp4";
            case ".mkv":
                return "video/x-matroska";
            case ".mov":
                return "video/quicktime";
            case ".avi":
                return "video/x-msvideo";
            default:
                return "application/octet-stream";
        }
    }

    return {
        filePath: path.resolve(filePath),
        filename,
        extension,
        mimeType: lookupMime(extension),
        sizeBytes: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
    };
}

/**
 * Create a readable stream for a file. Throws if file doesn't exist or is not readable.
 */
export function createFileStream(filePath: string): fs.ReadStream {
    // validate file
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) throw new Error("Path is not a file: " + filePath);
    return fs.createReadStream(filePath);
}
