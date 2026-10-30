import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import { uploadsDir } from "./db.mjs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const uploadProductFiles = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 9,
    fields: 30,
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const error = new Error("Допустимы только JPG, PNG и WebP.");
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
}).fields([
  { name: "main_image_file", maxCount: 1 },
  { name: "additional_files", maxCount: 8 },
]);

export async function saveUploadedImage(file) {
  if (!file?.buffer) throw new Error("Файл не получен.");
  let metadata;
  try {
    metadata = await sharp(file.buffer).metadata();
  } catch {
    throw new Error("Файл не похож на изображение.");
  }
  if (!["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error("Допустимы только JPG, PNG и WebP.");
  }

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.webp`;
  const destination = path.join(uploadsDir, filename);
  const optimized = await sharp(file.buffer)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  fs.writeFileSync(destination, optimized);
  return { filename, url: `/uploads/${filename}`, bytes: optimized.length };
}

export function deleteUploadedImage(publicPath) {
  if (typeof publicPath !== "string" || !publicPath.startsWith("/uploads/")) return;
  const filename = path.basename(publicPath);
  if (!/^[A-Za-z0-9._-]+\.webp$/.test(filename)) return;
  const target = path.join(uploadsDir, filename);
  if (!target.startsWith(uploadsDir + path.sep)) return;
  try {
    fs.unlinkSync(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function uploadedFileList(files) {
  return {
    main: files?.main_image_file?.[0] || null,
    additional: files?.additional_files || [],
  };
}
