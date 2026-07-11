import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { NextFunction, Request, RequestHandler, Response } from "express";
import logger from "../utils/logger";

// Ensure the uploads directory exists
// __dirname is the directory of the current module
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

// Made such that test doesnt require dev file path
// test can only access the memory bit
const storage =
  process.env.NODE_ENV === "test"
    ? multer.memoryStorage() // a little conditional statement that decides if its test or dev
    : multer.diskStorage({
        destination: function (req, file, cb) {
          // const folderName = req.file?.fieldname; // profile-image // post-image
          const folderName = file.fieldname; //doing this because gpt says req.file is undefined at this point, whatever that means
          const uploadDir = path.join(__dirname, "../../uploads/" + folderName);
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
          const uniqueSuffix = randomUUID();
          const originalExtension = path.extname(file.originalname).toLowerCase();
          // Path traversal defense: generated UUID filenames are used, and only known image extensions are preserved.
          const extension = ALLOWED_IMAGE_EXTENSIONS.has(originalExtension) ? originalExtension : "";
          cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
        },
      });

const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  // MIME filtering is only a quick first pass; magic-byte validation below proves the uploaded content is a real image.
  if (!file.mimetype.startsWith("image/")) {
    const error = new Error("Only image files are allowed!");
    (error as any).code = "INVALID_FILE_SIGNATURE";
    return cb(error);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB file size limit
});

function invalidImageError() {
  const error = new Error("Only valid JPEG, PNG, GIF, or WebP images are allowed.");
  (error as any).code = "INVALID_FILE_SIGNATURE";
  return error;
}

function isValidImageSignature(buffer: Buffer) {
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isGif =
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a");
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";

  return isJpeg || isPng || isGif || isWebp;
}

function uploadedFiles(req: Request) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === "object") return Object.values(req.files).flat();
  return [];
}

function removeUploadedFiles(files: Express.Multer.File[]) {
  for (const file of files) {
    if (!file.path) continue;

    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      logger.warn("Failed to remove rejected upload", { path: file.path, error });
    }
  }
}

function validateUploadedImages(req: Request) {
  const files = uploadedFiles(req);

  for (const file of files) {
    const buffer = file.buffer || (file.path ? fs.readFileSync(file.path) : Buffer.alloc(0));

    if (!isValidImageSignature(buffer)) {
      // Security evidence hook: magic-byte validation rejects renamed text files and spoofed MIME uploads after disk write.
      logger.warn("Rejected upload with invalid image signature", {
        field: file.fieldname,
        originalName: file.originalname,
        mimetype: file.mimetype,
        path: file.path,
      });

      removeUploadedFiles(files);
      throw invalidImageError();
    }
  }
}

function withImageSignatureValidation(middleware: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (error: any) => {
      if (error) return next(error);

      try {
        validateUploadedImages(req);
        return next();
      } catch (validationError) {
        return next(validationError);
      }
    });
  };
}

export const uploads = {
  single: (fieldName: string) => withImageSignatureValidation(upload.single(fieldName)),
  array: (fieldName: string, maxCount: number) =>
    withImageSignatureValidation(upload.array(fieldName, maxCount)),
  fields: (fieldsArray: { name: string; maxCount?: number }[]) =>
    withImageSignatureValidation(upload.fields(fieldsArray)),
};
