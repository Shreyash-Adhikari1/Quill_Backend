import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";

export const generateCSRFToken = (_req: Request, res: Response) => {
  // Generates an unpredictable token so attackers cannot forge state-changing requests.
  const token = crypto.randomBytes(32).toString("hex");

  res.cookie("csrf-token", token, {
    httpOnly: false, // Intentionally readable by frontend JavaScript for the double-submit cookie pattern.
    secure: process.env.NODE_ENV === "production", // Sends the token cookie only over HTTPS in production.
    sameSite: "strict", // Prevents the browser from sending this cookie on cross-site requests.
    maxAge: 24 * 60 * 60 * 1000, // Limits token lifetime to reduce replay risk.
  });

  return token;
};

export const validateCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  // Safe methods do not mutate server state, so CSRF checks are skipped for normal reads and preflight.
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const cookieToken = req.cookies?.["csrf-token"];
  const headerToken = req.headers["x-csrf-token"];

  // Both tokens must be strings before timing-safe comparison can be used safely.
  if (typeof cookieToken !== "string" || typeof headerToken !== "string") {
    // Logs CSRF failures as OWASP A01/Broken Access Control telemetry without logging secrets.
    logger.warn("CSRF token mismatch", { ip: req.ip, path: req.path, method: req.method });
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);

  // Equal length is required before timingSafeEqual; mismatched length is automatically invalid.
  if (cookieBuffer.length !== headerBuffer.length || !crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
    // Constant-time comparison prevents timing attacks that reveal partial token matches.
    logger.warn("CSRF token mismatch", { ip: req.ip, path: req.path, method: req.method });
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
};
