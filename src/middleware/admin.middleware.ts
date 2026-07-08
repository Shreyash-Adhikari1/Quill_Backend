import { NextFunction, Request, Response } from "express";
import { UserModel } from "../features/user/model/user.model";
import logger from "../utils/logger";

export const adminOnly = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user?.id) {
    // Admin authorization always requires an authenticated identity from authMiddleware first.
    logger.warn("Admin access rejected without authenticated user", { ip: req.ip, path: req.path, method: req.method });
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const currentUser = await UserModel.findById(user.id)
    .select("role sessionVersion")
    .lean()
    .exec();

  if (!currentUser || (currentUser.sessionVersion || 0) !== (user.sessionVersion || 0)) {
    // Re-checking sessionVersion blocks stale admin cookies after logout, password change, or role/session invalidation.
    logger.warn("Admin access rejected for stale or missing user", { ip: req.ip, path: req.path, method: req.method, userId: user.id });
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  if (currentUser.role !== "admin") {
    // The database role is authoritative; a client cannot become admin by editing request bodies or JWT payload text in Burp.
    logger.warn("Non-admin user attempted admin route", { ip: req.ip, path: req.path, method: req.method, userId: user.id });
    return res
      .status(403)
      .json({ success: false, message: "Only Admin can access" });
  }

  // Keep downstream handlers aligned with the authoritative database role, not a client-visible claim.
  (req as any).user = { ...user, role: currentUser.role };
  next();
};
