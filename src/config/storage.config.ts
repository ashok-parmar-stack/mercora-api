import { registerAs } from "@nestjs/config";

export default registerAs("storage", () => ({
  driver: process.env.STORAGE_DRIVER || "local",
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || "10", 10),
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
}));
