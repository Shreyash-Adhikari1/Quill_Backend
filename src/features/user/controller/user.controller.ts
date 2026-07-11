import { Request, Response } from "express";
import {
  ChangePasswordDTO,
  EditUserDTO,
  LoginUserDTO,
  MfaDisableDTO,
  MfaSetupDTO,
  OtpDTO,
  ProfileEditDTO,
  RegisterUserDTO,
  ResetPasswordDTO,
  VerifyEmailDTO,
} from "../dto/user.dto";
import { UserService } from "../service/user.service";
import { verifyRecaptchaToken } from "../service/captcha.service";
import { sendSafeError } from "../../../utils/api-response";
import { clearStrictCookieOptions, strictCookieOptions } from "../../../utils/security";

const userService = new UserService();

function requestContext(req: Request) {
  return { ip: req.ip, userAgent: req.get("user-agent") };
}

function setAuthCookie(res: Response, token: string) {
  res.cookie("token", token, strictCookieOptions(7 * 24 * 60 * 60 * 1000)); // httpOnly/Secure/SameSite cookie blocks JS token theft and CSRF-by-default.
}

export class UserController {
  getCaptcha = async (_req: Request, res: Response) => {
    // The old math CAPTCHA endpoint is retained for route compatibility; auth now uses Google reCAPTCHA tokens instead.
    return res.status(410).json({ success: false, message: "Use reCAPTCHA verification on auth forms." });
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

      const { recaptchaToken, ...data } = registerDetailsParsed.data;
      if (!(await verifyRecaptchaToken(recaptchaToken, req.ip, "REGISTER"))) {
        return res.status(400).json({ success: false, message: "Complete the reCAPTCHA challenge" });
      }

      const user = await userService.createUser(data, requestContext(req));

      return res.status(200).json({
        success: true,
        message: "Registration successful. Check your email for a verification OTP.",
        user,
      });
    } catch (error: any) {
      return sendSafeError(res, error, "User Registration Failed");
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

      const { email, password, recaptchaToken } = loginDetailsParsed.data;
      if (!(await verifyRecaptchaToken(recaptchaToken, req.ip, "LOGIN"))) {
        return res.status(400).json({ success: false, message: "Complete the reCAPTCHA challenge" });
      }

      const loginResult = await userService.loginUser(email, password, requestContext(req));

      if (loginResult.requiresOtp && loginResult.mfaToken) {
        res.cookie("mfa-token", loginResult.mfaToken, strictCookieOptions(5 * 60 * 1000)); // Short-lived httpOnly MFA challenge token.
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
      return sendSafeError(res, error, "User Login Failed");
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

      res.clearCookie("mfa-token", clearStrictCookieOptions());
      setAuthCookie(res, result.token);

      return res.status(200).json({ success: true, user: result.user });
    } catch (error: any) {
      return sendSafeError(res, error, "OTP verification failed");
    }
  };

  logoutUser = async (req: Request, res: Response) => {
    await userService.invalidateSessions((req as any).user.id, requestContext(req));

    res.clearCookie("token", clearStrictCookieOptions()); // Matches the protected JWT cookie attributes so browsers remove it.
    res.clearCookie("mfa-token", clearStrictCookieOptions());

    return res.status(200).json({ success: true, message: "Logged out successfully" });
  };

  verifyEmail = async (req: Request, res: Response) => {
    try {
      const parsed = VerifyEmailDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid verification request" });

      const user = await userService.verifyEmail(parsed.data.email, parsed.data.otp, requestContext(req));
      return res.status(200).json({ success: true, user, message: "Email verified successfully" });
    } catch (error: any) {
      return sendSafeError(res, error, "Verification failed");
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
      return sendSafeError(res, error, "Could not resend OTP");
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
      return sendSafeError(res, error, "User not found", 404);
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
      return sendSafeError(res, error, "User not found", 404);
    }
  };

  editProfile = async (req: Request, res: Response) => {
    try {
      const editDetailsParsed = ProfileEditDTO.safeParse(req.body);

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
      return sendSafeError(res, error, "Something went wrong");
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
      return sendSafeError(res, error, "Password change failed");
    }
  };

  setupMfa = async (req: Request, res: Response) => {
    try {
      const parsed = MfaSetupDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Current password is required" });

      const result = await userService.setupMfa((req as any).user.id, parsed.data.currentPassword);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return sendSafeError(res, error, "MFA setup failed");
    }
  };

  confirmMfa = async (req: Request, res: Response) => {
    try {
      const parsed = OtpDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid OTP" });

      const user = await userService.confirmMfa((req as any).user.id, parsed.data.otp, requestContext(req));
      return res.status(200).json({ success: true, user, message: "MFA enabled" });
    } catch (error: any) {
      return sendSafeError(res, error, "MFA confirmation failed");
    }
  };

  disableMfa = async (req: Request, res: Response) => {
    try {
      const parsed = MfaDisableDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid MFA disable request" });

      const user = await userService.disableMfa(
        (req as any).user.id,
        parsed.data.otp,
        parsed.data.currentPassword,
        requestContext(req),
      );
      return res.status(200).json({ success: true, user, message: "MFA disabled" });
    } catch (error: any) {
      return sendSafeError(res, error, "MFA disable failed");
    }
  };

  exportMyData = async (req: Request, res: Response) => {
    try {
      const data = await userService.exportMyData((req as any).user.id, requestContext(req));
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return sendSafeError(res, error, "Export failed");
    }
  };

  importMyData = async (req: Request, res: Response) => {
    try {
      const parsed = EditUserDTO.pick({ fullName: true, bio: true, avatarUrl: true }).partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid import payload" });

      const user = await userService.importMyData((req as any).user.id, parsed.data, requestContext(req));
      return res.status(200).json({ success: true, user, message: "Data imported successfully" });
    } catch (error: any) {
      return sendSafeError(res, error, "Import failed");
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
      return sendSafeError(res, error, "User Delete Failed");
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
      return sendSafeError(res, error, "Internal Server Error");
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
      return sendSafeError(res, error, "Internal Server Error");
    }
  };

  resetPassword = async (req: Request, res: Response) => {
    try {
      const parsed = ResetPasswordDTO.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid password reset request" });

      const { email, otp, newPassword } = parsed.data;
      await userService.resetPassword(email, otp, newPassword, requestContext(req));
      return res.status(200).json({
        success: true,
        message: "Password has been reset successfully.",
      });
    } catch (error: Error | any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };
}
