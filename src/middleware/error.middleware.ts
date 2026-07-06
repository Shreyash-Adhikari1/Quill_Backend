import { NextFunction, Request, Response } from "express";
import multer from "multer";
import logger from "../utils/logger";

type AppError = Error & {
  statusCode?: number;
  status?: number;
  type?: string;
  code?: string;
};

function safeErrorMessage(error: AppError) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") return "Uploaded file is too large. Maximum size is 5 MB.";
    return "File upload failed.";
  }

  if (error.code === "INVALID_FILE_SIGNATURE") return "Only valid JPEG, PNG, GIF, or WebP images are allowed.";
  if (error.type === "entity.too.large") return "Request body is too large.";
  if (error instanceof SyntaxError && error.status === 400) return "Invalid JSON request body.";

  if (process.env.NODE_ENV === "production") return "Internal server error";

  return error.message || "Internal server error";
}

// Centralized error handling keeps production-style API responses from leaking stack traces or internal implementation details.
export const globalErrorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const statusCode =
    error instanceof multer.MulterError || error.code === "INVALID_FILE_SIGNATURE"
      ? 400
      : error.statusCode || error.status || 500;
  const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;

  // Security evidence hook: logs upload/body/parser failures for coursework and incident review without echoing secrets to clients.
  logger.error("Request failed in global error handler", {
    ip: req.ip,
    path: req.path,
    method: req.method,
    statusCode: safeStatusCode,
    code: error.code,
    type: error.type,
    message: error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  });

  return res.status(safeStatusCode).json({
    success: false,
    message: safeErrorMessage(error),
  });
};
