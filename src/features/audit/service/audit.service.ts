import { Types } from "mongoose";
import logger from "../../../utils/logger";
import { ActivityLogModel } from "../model/activity-log.model";

type AuditInput = {
  userId?: string;
  action: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

type AuditQuery = {
  page?: number;
  limit?: number;
  action?: string;
  userId?: string;
};

export async function auditActivity(input: AuditInput) {
  try {
    // Audit records support incident response and accountability without storing passwords, OTPs, JWTs, or request bodies.
    await ActivityLogModel.create({
      userId: input.userId && Types.ObjectId.isValid(input.userId) ? new Types.ObjectId(input.userId) : undefined,
      action: input.action,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: input.metadata,
    });
  } catch (error) {
    // Audit logging must never break the user workflow, but failures are still security-relevant operational events.
    logger.error("Failed to write audit log", { action: input.action, error });
  }
}

export async function getAuditLogs(query: AuditQuery = {}) {
  const page = Number.isFinite(query.page) && query.page! > 0 ? query.page! : 1;
  const limit = Math.min(
    Number.isFinite(query.limit) && query.limit! > 0 ? query.limit! : 50,
    500,
  );
  const filter: Record<string, unknown> = {};

  if (query.action) filter.action = query.action;
  if (query.userId) filter.userId = query.userId;

  // Admin-only audit reads are capped and sorted newest-first to support incident review without exposing raw credentials.
  const [logs, total] = await Promise.all([
    ActivityLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec(),
    ActivityLogModel.countDocuments(filter).exec(),
  ]);

  return { logs, total, page, limit };
}
