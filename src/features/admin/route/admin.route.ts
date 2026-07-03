import { Router } from "express";
import { AdminController } from "../controller/admin.controller";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { adminOnly } from "../../../middleware/admin.middleware";

export const adminRouter = Router();
const adminController = new AdminController();

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
  adminController.deleteAllUsers,
);

adminRouter.delete(
  "/users/delete/:userId",
  authMiddleware,
  adminOnly,
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
  adminController.deleteAllPostsByUser,
);

adminRouter.delete(
  "/posts/delete/:postId",
  authMiddleware,
  adminOnly,
  adminController.deletePost,
);

export default adminRouter;
