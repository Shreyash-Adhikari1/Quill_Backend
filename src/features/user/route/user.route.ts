import { Router } from "express";
import {
  authLimiter,
  authMiddleware,
  passwordResetLimiter,
} from "../../../middleware";
import { UserController } from "../controller/user.controller";
import { uploads } from "../../../middleware/upload.middleware";
const userRouter = Router();
const userController = new UserController();

// Public routes
userRouter.get("/captcha", userController.getCaptcha);

userRouter.post("/register", authLimiter, userController.registerUser);

userRouter.post("/login", authLimiter, userController.loginUser);
userRouter.post(
  "/verify-login-otp",
  authLimiter,
  userController.verifyLoginOtp,
);

userRouter.post("/logout", authMiddleware, userController.logoutUser);
userRouter.post("/verify-otp", authLimiter, userController.verifyEmail);
userRouter.post("/resend-otp", authLimiter, userController.resendEmailOtp);

// Protected Routes
userRouter.get("/me", authMiddleware, userController.getMyProfile);

userRouter.patch(
  "/me",
  authMiddleware,
  uploads.single("profile-image"),
  userController.editProfile,
);

userRouter.patch("/me/password", authMiddleware, userController.changePassword);
userRouter.post("/me/mfa/setup", authMiddleware, userController.setupMfa);
userRouter.post("/me/mfa/confirm", authMiddleware, userController.confirmMfa);
userRouter.post("/me/mfa/disable", authMiddleware, userController.disableMfa);
userRouter.get("/me/export", authMiddleware, userController.exportMyData);
userRouter.post("/me/import", authMiddleware, userController.importMyData);

userRouter.delete("/me", authMiddleware, userController.deleteUser);

// get routes
userRouter.get("/:userId", authMiddleware, userController.getUserProfile);

userRouter.post(
  "/request-password-reset",
  passwordResetLimiter,
  userController.sendResetPasswordEmail,
);
userRouter.post(
  "/reset-password",
  passwordResetLimiter,
  userController.resetPassword,
);
// router.post("/reset-password/:token", authController.resetPassword);
export default userRouter;
