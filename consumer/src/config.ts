import dotenv from "dotenv";

dotenv.config();

export const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploaded-videos";
export const PREVIEW_DIR = "./previews";
export const WEB_PORT = Number(process.env.WEB_PORT) || 3000;
