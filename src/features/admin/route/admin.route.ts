import { NextFunction, Request, Response, Router } from "express";
import { AdminController } from "../controller/admin.controller";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { adminOnly } from "../../../middleware/admin.middleware";

export const adminRouter = Router();
const adminController = new AdminController();

function requireAdminConfirmation(req: Request, res: Response, next: NextFunction) {
  if (req.get("X-Confirm-Action") !== "DELETE") {
    // Step-up friction for bulk destructive admin actions: a stolen admin page click should not wipe data silently.
    return res.status(400).json({ success: false, message: "Bulk delete confirmation header is required" });
  }

  next();
}

// ====================================== ADMIN-AUDIT ROUTES ===============================
adminRouter.get(
  "/audit-logs",
  authMiddleware,
  adminOnly,
  adminController.getAuditLogs,
);

adminRouter.get(
  "/audit-logs/export",
  authMiddleware,
  adminOnly,
  adminController.exportAuditLogs,
);

// ====================================== ADMIN-USER ROUTES ===============================
// User Get Routes
adminRouter.get(
  "/users",
  authMiddleware,
  adminOnly,
  adminController.getAllusers,
);

adminRouter.get(
  "/users/id/:userId",
  authMiddleware,
  adminOnly,
  adminController.getUserById,
);

adminRouter.get(
  "/users/username/:username",
  authMiddleware,
  adminOnly,
  adminController.getUserByusername,
);

adminRouter.patch(
  "/users/edit/:userId",
  authMiddleware,
  adminOnly,
  adminController.editUser,
);

// User Delete Routes
adminRouter.delete(
  "/users/deleteAll",
  authMiddleware,
  adminOnly,
  requireAdminConfirmation,
  adminController.deleteAllUsers,
);

adminRouter.delete(
  "/users/delete/:userId",
  authMiddleware,
  adminOnly,
  requireAdminConfirmation,
  adminController.deleteUser,
);

// ================================ ADMIN-POST ROUTES =======================

// Post Get Operations
adminRouter.get(
  "/posts",
  authMiddleware,
  adminOnly,
  adminController.getAllPosts,
);

adminRouter.get(
  "/posts/user/:userId",
  authMiddleware,
  adminOnly,
  adminController.getPostByUser,
);

adminRouter.get(
  "/posts/post/:postId",
  authMiddleware,
  adminOnly,
  adminController.getPostById,
);

// Post delete routes
adminRouter.delete(
  "/posts/deleteAll/:userId",
  authMiddleware,
  adminOnly,
  requireAdminConfirmation,
  adminController.deleteAllPostsByUser,
);

adminRouter.delete(
  "/posts/delete/:postId",
  authMiddleware,
  adminOnly,
  requireAdminConfirmation,
  adminController.deletePost,
);

export default adminRouter;
