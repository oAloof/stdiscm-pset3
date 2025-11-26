import * as fs from "fs";
import * as path from "path";
import { Logger } from "./logger";

const logger = new Logger("Utils");

/**
 * Metadata about a video file including file system properties and MIME type.
 */
export interface VideoMetadata {
    /** Absolute path to the video file */
    filePath: string;
    /** File name with extension */
    filename: string;
    /** File extension (e.g., ".mp4") */
    extension: string;
    /** MIME type for the video format */
    mimeType: string;
    /** File size in bytes */
    sizeBytes: number;
    /** File creation timestamp */
    createdAt: Date;
    /** File last modification timestamp */
    modifiedAt: Date;
}

/**
 * Checks if a filename has a supported video file extension.
 * Supported formats: .mp4, .mkv, .mov, .avi
 * 
 * @param filename - The filename to check (case-insensitive)
 * @returns true if the file is a supported video format
 * 
 * @example
 * isVideoFile("movie.mp4") // true
 * isVideoFile("document.pdf") // false
 */
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

/**
 * Recursively scans a folder for video files with supported extensions.
 * Skips hidden directories (starting with '.') and node_modules folders.
 * 
 * @param folderPath - Root folder path to scan
 * @returns Array of absolute paths to discovered video files
 * @throws {Error} If the folder doesn't exist or is not a directory
 * 
 * @example
 * const videos = await discoverVideoFiles("./my-videos");
 * console.log(`Found ${videos.length} videos`);
 */
export async function discoverVideoFiles(folderPath: string): Promise<string[]> {
    const results: string[] = [];
    const resolvedPath = path.resolve(folderPath);

    logger.info(`Starting video discovery in: ${resolvedPath}`);

    // Validate root folder exists and is a directory
    try {
        const stats = await fs.promises.stat(resolvedPath);
        if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${folderPath}`);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Folder does not exist: ${folderPath}`);
        }
        throw error;
    }

    /**
     * Recursively walks through directories to find video files
     */
    async function walk(dir: string): Promise<void> {
        let dirents: fs.Dirent[];
        try {
            dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch (err) {
            // Ignore unreadable subdirectories (permission errors, etc.)
            return;
        }

        for (const dirent of dirents) {
            const fullPath = path.join(dir, dirent.name);

            if (dirent.isDirectory()) {
                // Skip node_modules and hidden directories for performance
                if (dirent.name === "node_modules" || dirent.name.startsWith(".")) {
                    continue;
                }
                await walk(fullPath);
            } else if (dirent.isFile() && isVideoFile(dirent.name)) {
                logger.info(`Found video file: ${dirent.name}`);
                results.push(fullPath);
            }
        }
    }

    await walk(resolvedPath);
    logger.info(`Discovery complete. Found ${results.length} video(s).`);
    return results;
}

/**
 * Retrieves filesystem metadata for a video file.
 * 
 * @param filePath - Path to the video file
 * @returns VideoMetadata object with file properties
 * @throws {Error} If the file doesn't exist or is not accessible
 * 
 * @example
 * const meta = getVideoMetadata("./video.mp4");
 * console.log(`Size: ${meta.sizeBytes} bytes`);
 */
export function getVideoMetadata(filePath: string): VideoMetadata {
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const extension = path.extname(filename).toLowerCase();

    /**
     * Maps file extension to appropriate MIME type
     */
    function lookupMimeType(ext: string): string {
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
        mimeType: lookupMimeType(extension),
        sizeBytes: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
    };
}

/**
 * Creates a readable stream for a video file.
 * Validates that the path exists and is a file before creating the stream.
 * 
 * @param filePath - Path to the video file
 * @returns Readable stream for the file
 * @throws {Error} If the path doesn't exist, is not a file, or is not readable
 * 
 * @example
 * const stream = createFileStream("./video.mp4");
 * stream.on('data', (chunk) => console.log('Read chunk'));
 */
export function createFileStream(filePath: string): fs.ReadStream {
    // Validate file exists and is readable
    try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${filePath}`);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`File does not exist: ${filePath}`);
        }
        throw error;
    }

    return fs.createReadStream(filePath);
}
