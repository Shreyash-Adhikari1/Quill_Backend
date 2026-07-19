import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import helmet from "helmet";
import { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";

// Helmet sets HTTP response headers that reduce browser-side attack surface, including XSS and clickjacking.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], // Only allow same-origin resources by default to reduce injected content execution.
      scriptSrc: ["'self'"], // Blocks third-party injected scripts, a primary OWASP A03 Injection/XSS defense.
      styleSrc: ["'self'", "'unsafe-inline'"], // Allows local inline styles needed during development while limiting remote CSS injection.
      imgSrc: ["'self'", "data:", "https:"], // Permits app images, data previews, and HTTPS image URLs without allowing insecure HTTP media.
      connectSrc: ["'self'"], // Restricts browser API calls to this origin to reduce data exfiltration paths.
      fontSrc: ["'self'"], // Prevents remote font loading from becoming a tracking or injection channel.
      objectSrc: ["'none'"], // Blocks legacy plugin content that can execute active payloads.
      frameSrc: ["'none'"], // Prevents framing to defend against clickjacking.
    },
  },
  // Uploaded avatars are intentionally loaded by the separate frontend origin during local HTTPS development.
  crossOriginResourcePolicy: { policy: "cross-origin" },
  noSniff: true, // Stops MIME sniffing so uploaded or mislabeled files are not executed as scripts.
  hsts:
    process.env.NODE_ENV === "production"
      ? {
          maxAge: 31536000, // Tells browsers to use HTTPS for one year after first secure visit.
          includeSubDomains: true, // Extends HTTPS-only behavior to subdomains.
          preload: true, // Allows preload-list submission when production TLS is ready.
        }
      : false, // Avoids breaking local HTTP development before mkcert HTTPS is configured.
  frameguard: { action: "deny" }, // Sends X-Frame-Options DENY as a clickjacking defense.
  xssFilter: true, // Enables legacy browser XSS filtering as defense in depth.
});

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function normalizeHost(value?: string) {
  return (value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase();
}

function hostFromUrl(value?: string) {
  if (!value) return "";

  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return normalizeHost(value);
  }
}

function allowedHostValues() {
  const port = process.env.PORT || "5000";
  const hosts = uniqueValues([
    process.env.SERVER_HOST,
    hostFromUrl(process.env.LOCAL_SERVER_URL),
    hostFromUrl(process.env.LOCAL_CLIENT_URL),
    hostFromUrl(process.env.VM_SERVER_URL),
    hostFromUrl(process.env.VM_CLIENT_URL),
    hostFromUrl(process.env.SERVER_URL),
    hostFromUrl(process.env.CLIENT_URL),
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
  ]);

  return new Set(hosts.map(normalizeHost).filter(Boolean));
}

// Host header validation blocks cache-poisoning, password-reset poisoning, and proxy confusion attacks during localhost and VMware testing.
export const hostHeaderValidation = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const allowedHosts = allowedHostValues();
  const hostHeaders = uniqueValues([
    req.headers.host,
    ...(typeof req.headers["x-forwarded-host"] === "string"
      ? req.headers["x-forwarded-host"].split(",")
      : req.headers["x-forwarded-host"] || []),
  ]).map(normalizeHost);

  const invalidHost = hostHeaders.find(
    (host) => !host || !allowedHosts.has(host),
  );

  if (invalidHost) {
    // Security evidence hook: rejected host headers are logged without request bodies or credentials.
    logger.warn("Rejected untrusted host header", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      host: req.headers.host,
      forwardedHost: req.headers["x-forwarded-host"],
    });

    return res
      .status(400)
      .json({ success: false, message: "Invalid host header" });
  }

  next();
};

// CORS limits which browser origins may send credentialed requests, reducing CSRF exposure with cookies.
export const corsMiddleware = cors({
  origin: uniqueValues([
    process.env.CLIENT_URL,
    process.env.LOCAL_CLIENT_URL,
    process.env.VM_CLIENT_URL,
    "https://localhost:3000",
    "http://localhost:3000",
  ]), // Only configured frontend origins can make browser requests with cookies; supports local and VMware testing URLs.
  credentials: true, // Allows httpOnly auth cookies to be sent intentionally from the trusted frontend.
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], // Limits cross-origin verbs to API-supported methods.
  // X-Confirm-Action is narrowly allowed so trusted-origin admin DELETE
  // preflights can reach the route-level destructive-action confirmation check.
  // CSRF and admin authorization are still independently required.
  allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Confirm-Action"],
});

function parseIpList(value?: string) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// Optional IP block/allow lists give administrators an emergency control for known hostile sources or restricted deployments.
export const ipAccessControl = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const blockedIps = parseIpList(process.env.SECURITY_BLOCKED_IPS);
  const allowedIps = parseIpList(process.env.SECURITY_ALLOWED_IPS);
  const ip = req.ip || "";

  if (blockedIps.includes(ip)) {
    logger.warn("Blocked IP rejected", {
      ip,
      path: req.path,
      method: req.method,
    });
    return res.status(403).json({ error: "Access denied" });
  }

  if (allowedIps.length > 0 && !allowedIps.includes(ip)) {
    logger.warn("Non-allowlisted IP rejected", {
      ip,
      path: req.path,
      method: req.method,
    });
    return res.status(403).json({ error: "Access denied" });
  }

  next();
};

// Global rate limiting reduces brute-force and denial-of-service risk across all routes.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Uses a 15-minute window to slow repeated abuse.
  max: 100, // Caps each IP to 100 requests per window to reduce automated flooding.
  standardHeaders: true, // Emits RateLimit-* headers so clients can back off cleanly.
  legacyHeaders: false, // Avoids older nonstandard headers.
  message: { error: "Too many requests, please try again later" },
  handler: (req: Request, res: Response) => {
    // Logs rate-limit hits as security telemetry without storing passwords, tokens, or request bodies.
    logger.warn("Rate limit hit", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res
      .status(429)
      .json({ error: "Too many requests, please try again later" });
  },
});

// Auth limiter is exported for login/register/OTP routes where brute-force risk is higher.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Short window makes password guessing expensive.
  max: 15, // Only five auth attempts per IP per window.
  standardHeaders: true, // Provides standard retry metadata to legitimate clients.
  legacyHeaders: false, // Avoids legacy leak-prone header variants.
  skipSuccessfulRequests: true, // Successful auth does not punish legitimate users.
  message: {
    error: "Too many authentication attempts. Please wait 15 minutes.",
  },
  handler: (req: Request, res: Response) => {
    // Logs throttled auth attempts for brute-force monitoring.
    logger.warn("Auth rate limit hit", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res
      .status(429)
      .json({
        error: "Too many authentication attempts. Please wait 15 minutes.",
      });
  },
});

// Password-reset limiter prevents inbox flooding and reset-token brute forcing.
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // One-hour window slows repeated reset abuse.
  max: 3, // Only three reset attempts per IP per hour.
  standardHeaders: true, // Exposes standard retry metadata.
  legacyHeaders: false, // Avoids legacy nonstandard headers.
  message: { error: "Too many password reset requests. Please wait 1 hour." },
});

// Mongo sanitization strips dangerous MongoDB operator keys before user input reaches queries.
export const mongoSanitizeMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const options = { replaceWith: "_" }; // Replaces $ and . so attempted NoSQL injection is neutralized but still recognizable.

  for (const key of ["body", "params"] as const) {
    const value = req[key];

    if (value && mongoSanitize.has(value)) {
      // Logs sanitized keys as OWASP A03 Injection telemetry without logging the full request body.
      logger.warn("NoSQL injection attempt detected", {
        ip: req.ip,
        key,
        path: req.path,
      });
      req[key] = mongoSanitize.sanitize(value, options);
    }
  }

  next();
};

// Exact global middleware order requested before route registration.
export const securityMiddleware = [
  hostHeaderValidation,
  helmetMiddleware,
  corsMiddleware,
  ipAccessControl,
  globalLimiter,
  mongoSanitizeMiddleware,
];
