import { NextFunction, Request, Response } from "express";

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    // 403 means the user is authenticated but lacks the required role; 401 is reserved for missing/invalid authentication.
    // Reading role from the JWT avoids an extra database lookup and reduces authorization latency.
    return res
      .status(403)
      .json({ success: false, message: "Only Admin can access" });
  }
  next();
};
