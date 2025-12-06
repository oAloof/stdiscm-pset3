import dotenv from "dotenv";

dotenv.config();

export const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploaded-videos";
export const PREVIEW_DIR = "./previews";
export const THUMBNAIL_DIR = "./thumbnails";
export const WEB_PORT = Number(process.env.WEB_PORT) || 3000;

export const COMPRESSED_DIR = "./compressed-videos";
export const COMPRESSION_ENABLED = process.env.COMPRESSION_ENABLED !== "false";
export const COMPRESSION_CODEC = process.env.COMPRESSION_CODEC || "libx264";
export const COMPRESSION_CRF = Number(process.env.COMPRESSION_CRF) || 23;
export const COMPRESSION_PRESET = process.env.COMPRESSION_PRESET || "ultrafast";
export const COMPRESSION_AUDIO_BITRATE = process.env.COMPRESSION_AUDIO_BITRATE || "128k";
