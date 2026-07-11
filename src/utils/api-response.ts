import { Response } from "express";

type SafeError = Error & {
  statusCode?: number;
  status?: number;
};

function statusFromError(error: SafeError, fallbackStatus = 500) {
  const statusCode = error.statusCode || error.status || fallbackStatus;
  return statusCode >= 400 && statusCode < 600 ? statusCode : fallbackStatus;
}

export function sendSafeError(res: Response, error: unknown, fallbackMessage: string, fallbackStatus = 500) {
  const safeError = error as SafeError;
  const statusCode = statusFromError(safeError, fallbackStatus);
  const isClientSafe = statusCode >= 400 && statusCode < 500 && Boolean(safeError.statusCode || safeError.status);

  // Information-disclosure control: only deliberate 4xx HttpError-style messages are returned.
  // Unexpected Error.message values can contain internal model, cast, stack, or dependency details.
  return res.status(statusCode).json({
    success: false,
    message: isClientSafe ? safeError.message : fallbackMessage,
  });
}
