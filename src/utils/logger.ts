import fs from "fs";
import path from "path";
import winston from "winston";

const logsDir = path.join(process.cwd(), "logs");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Winston writes structured security logs so incident response can trace what happened, when, and from where.
export const logger = winston.createLogger({
  // Production logs only warnings and errors to reduce sensitive operational noise in retained logs.
  level: process.env.NODE_ENV === "production" ? "warn" : "info",
  // Timestamped JSON logs are machine-readable for audit trails and SIEM ingestion.
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    // Error logs are separated so high-severity security/application failures can be reviewed quickly.
    new winston.transports.File({ filename: path.join(logsDir, "error.log"), level: "error" }),
    // Combined logs retain warnings such as CSRF, NoSQL injection, and unauthorized-access events.
    new winston.transports.File({ filename: path.join(logsDir, "combined.log") }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  // Development console logging helps debugging without exposing production security events to stdout logs.
  logger.add(new winston.transports.Console({ format: winston.format.simple() }));
}

export default logger;
