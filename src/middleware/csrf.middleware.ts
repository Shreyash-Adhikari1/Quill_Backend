import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";
import { requireJwtSecret, strictCookieOptions } from "../utils/security";

export const generateCSRFToken = (_req: Request, res: Response) => {
  // Generates an unpredictable token so attackers cannot forge state-changing requests.
  const nonce = crypto.randomBytes(32).toString("hex");
  const secret = requireJwtSecret();
  const signature = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
  const token = `${nonce}.${signature}`;

  res.cookie("csrf-token", token, strictCookieOptions(24 * 60 * 60 * 1000, false)); // Readable by JS for double-submit, but still Secure/SameSite.

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

  const [nonce, signature] = cookieToken.split(".");
  const secret = requireJwtSecret();
  const expectedSignature = nonce
    ? crypto.createHmac("sha256", secret).update(nonce).digest("hex")
    : "";

  if (!nonce || !signature || signature.length !== expectedSignature.length) {
    logger.warn("CSRF token mismatch", { ip: req.ip, path: req.path, method: req.method });
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    // Server-issued token verification stops attackers from choosing arbitrary matching cookie/header pairs.
    logger.warn("CSRF token mismatch", { ip: req.ip, path: req.path, method: req.method });
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
};
