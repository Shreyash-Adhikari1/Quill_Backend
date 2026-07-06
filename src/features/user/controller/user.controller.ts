import { Request, Response } from "express";
import {
  ChangePasswordDTO,
  EditUserDTO,
  LoginUserDTO,
  OtpDTO,
  RegisterUserDTO,
  VerifyEmailDTO,
} from "../dto/user.dto";
import { UserService } from "../service/user.service";
import { createCaptchaChallenge, verifyCaptchaChallenge } from "../service/captcha.service";

const userService = new UserService();

function requestContext(req: Request) {
  return { ip: req.ip, userAgent: req.get("user-agent") };
}

function setAuthCookie(res: Response, token: string) {
  res.cookie("token", token, {
    httpOnly: true, // Prevents JavaScript access to the JWT, blocking XSS token theft.
    secure: process.env.NODE_ENV === "production", // Sends the JWT only over HTTPS in production.
    sameSite: "strict", // Prevents the cookie being sent on cross-site requests, reducing CSRF risk.
    maxAge: 7 * 24 * 60 * 60 * 1000, // Gives the auth cookie an explicit seven-day lifetime.
  });
}

export class UserController {
  getCaptcha = async (_req: Request, res: Response) => {
    // CAPTCHA is issued server-side so automated clients cannot simply submit auth forms without solving a fresh challenge.
    return res.status(200).json({ success: true, ...createCaptchaChallenge() });
  };

  registerUser = async (req: Request, res: Response) => {
    try {
      const registerDetailsParsed = RegisterUserDTO.safeParse(req.body);

      if (!registerDetailsParsed.success) {
        return res
          .status(400)
          .json({
            success: false,
            message: registerDetailsParsed.error.issues[0]?.message || "Registration Failed",
          });
      }

      const { captchaId, captchaAnswer, ...data } = registerDetailsParsed.data;
      if (!verifyCaptchaChallenge(captchaId, captchaAnswer)) {
        return res.status(400).json({ success: false, message: "Invalid CAPTCHA challenge" });
      }

      const user = await userService.createUser(data, requestContext(req));

      return res.status(200).json({
        success: true,
        message: "Registration successful. Check your email for a verification OTP.",
        user,
      });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({
        success: false,
        message: error.message || "User Registration Failed",
      });
    }
  };

  loginUser = async (req: Request, res: Response) => {
    const loginDetailsParsed = LoginUserDTO.safeParse(req.body);

    try {
      if (!loginDetailsParsed.success) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid Credentials" });
      }

      const { email, password, captchaId, captchaAnswer } = loginDetailsParsed.data;
      if (!verifyCaptchaChallenge(captchaId, captchaAnswer)) {
        return res.status(400).json({ success: false, message: "Invalid CAPTCHA challenge" });
      }

      const loginResult = await userService.loginUser(email, password, requestContext(req));

      if (loginResult.requiresOtp && loginResult.mfaToken) {
        res.cookie("mfa-token", loginResult.mfaToken, {
          httpOnly: true, // The temporary MFA challenge token is also hidden from JavaScript to prevent XSS theft.
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 5 * 60 * 1000,
        });
        return res.status(200).json({
          success: true,
          requiresOtp: true,
          message: "Two-factor verification required",
        });
      }

      setAuthCookie(res, loginResult.token!);

      return res.status(201).json({
        success: true,
        requiresOtp: false,
        message: "Login Successful",
        user: loginResult.user,
      });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({
        success: false,
        message: error.message || "User Login Failed",
      });
    }
  };

  verifyLoginOtp = async (req: Request, res: Response) => {
    try {
      const parsed = OtpDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid OTP" });

      const result = await userService.verifyLoginOtp(
        req.cookies?.["mfa-token"],
        parsed.data.otp,
        requestContext(req),
      );

      res.clearCookie("mfa-token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      setAuthCookie(res, result.token);

      return res.status(200).json({ success: true, user: result.user });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "OTP verification failed" });
    }
  };

  logoutUser = async (req: Request, res: Response) => {
    await userService.invalidateSessions((req as any).user.id, requestContext(req));

    res.clearCookie("token", {
      httpOnly: true, // Matches the login cookie so the browser removes the protected JWT cookie.
      secure: process.env.NODE_ENV === "production", // Uses the same HTTPS-only production setting as issuance.
      sameSite: "strict", // Uses the same CSRF-resistant SameSite attribute as issuance.
    });
    res.clearCookie("mfa-token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(200).json({ success: true, message: "Logged out successfully" });
  };

  verifyEmail = async (req: Request, res: Response) => {
    try {
      const parsed = VerifyEmailDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid verification request" });

      const user = await userService.verifyEmail(parsed.data.email, parsed.data.otp, requestContext(req));
      return res.status(200).json({ success: true, user, message: "Email verified successfully" });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Verification failed" });
    }
  };

  resendEmailOtp = async (req: Request, res: Response) => {
    try {
      const email = req.body.email;
      if (!email) return res.status(400).json({ success: false, message: "Email is required" });

      await userService.resendVerificationEmail(email, requestContext(req));
      return res.status(200).json({
        success: true,
        message: "If the account exists, a verification OTP was sent.",
      });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Could not resend OTP" });
    }
  };

  getMyProfile = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      const user = await userService.getUserById(userId);

      return res.status(200).json({
        success: true,
        user,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || "User not found",
      });
    }
  };

  getUserProfile = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const user = await userService.getPublicUserById(userId as string);

      return res.status(200).json({
        success: true,
        user,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || "User not found",
      });
    }
  };

  editProfile = async (req: Request, res: Response) => {
    try {
      const editDetailsParsed = EditUserDTO.safeParse(req.body);

      if (!editDetailsParsed.success) {
        return res.status(400).json({
          message: "Invalid input",
          errors: editDetailsParsed.error.format(),
        });
      }
      const userId = (req as any).user.id;
      const avatarFileName = req.file?.filename;

      const updatedUser = await userService.updateUser(userId, {
        ...editDetailsParsed.data,
        avatarUrl: avatarFileName ?? editDetailsParsed.data.avatarUrl,
      }, requestContext(req));
      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user: updatedUser,
      });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({
        success: false,
        message: error.message || "Something went wrong",
      });
    }
  };

  changePassword = async (req: Request, res: Response) => {
    try {
      const parsed = ChangePasswordDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid password change request" });

      const token = await userService.changePassword((req as any).user.id, parsed.data, requestContext(req));
      if (token) setAuthCookie(res, token);
      return res.status(200).json({ success: true, message: "Password changed successfully" });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Password change failed" });
    }
  };

  setupMfa = async (req: Request, res: Response) => {
    try {
      const result = await userService.setupMfa((req as any).user.id);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "MFA setup failed" });
    }
  };

  confirmMfa = async (req: Request, res: Response) => {
    try {
      const parsed = OtpDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid OTP" });

      const user = await userService.confirmMfa((req as any).user.id, parsed.data.otp, requestContext(req));
      return res.status(200).json({ success: true, user, message: "MFA enabled" });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "MFA confirmation failed" });
    }
  };

  disableMfa = async (req: Request, res: Response) => {
    try {
      const parsed = OtpDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid OTP" });

      const user = await userService.disableMfa((req as any).user.id, parsed.data.otp, requestContext(req));
      return res.status(200).json({ success: true, user, message: "MFA disabled" });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "MFA disable failed" });
    }
  };

  exportMyData = async (req: Request, res: Response) => {
    try {
      const data = await userService.exportMyData((req as any).user.id, requestContext(req));
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Export failed" });
    }
  };

  importMyData = async (req: Request, res: Response) => {
    try {
      const parsed = EditUserDTO.pick({ fullName: true, bio: true, avatarUrl: true }).partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid import payload" });

      const user = await userService.importMyData((req as any).user.id, parsed.data, requestContext(req));
      return res.status(200).json({ success: true, user, message: "Data imported successfully" });
    } catch (error: any) {
      return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Import failed" });
    }
  };

  deleteUser = async (req: Request, res: Response) => {
    try {
      const userId = await (req as any).user.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "User Doesnt Exist" });
      }
      await userService.deleteUser(userId, requestContext(req));
      return res
        .status(200)
        .json({ success: true, message: "User Deleted Successfully" });
    } catch (error: any) {
      return res
        .status(error.statusCode ?? 500)
        .json({ success: false, message: "User Delete Failed" });
    }
  };

  getAllusers = async (_req: Request, res: Response) => {
    try {
      const users = await userService.getAllUsers();
      return res.status(200).json({
        success: true,
        message: "Users Fetched Successfully",
        users: users,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  sendResetPasswordEmail = async (req: Request, res: Response) => {
    try {
      const email = req.body.email;
      await userService.sendResetPasswordEmail(email, requestContext(req));
      return res.status(200).json({
        success: true,
        message: "If the email is registered, a reset OTP has been sent.",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode ?? 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  resetPassword = async (req: Request, res: Response) => {
    try {
      const { email, otp, newPassword } = req.body;
      await userService.resetPassword(email, otp, newPassword, requestContext(req));
      return res.status(200).json({
        success: true,
        message: "Password has been reset successfully.",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode ?? 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };
}
