import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
import qrcode from "qrcode";
import speakeasy from "speakeasy";
import {
  UserRepository,
  UserRepositoryInterface,
} from "../repository/user.repository";
import { IUser } from "../model/user.model";
import { ChangePasswordDTO, EditUserDTO, PasswordPolicySchema, ProfileEditDTO, RegisterUserDTO } from "../dto/user.dto";
import { HttpError } from "../../../errors/http-error";
import { sendEmail } from "../../../config/email";
import logger from "../../../utils/logger";
import { auditActivity } from "../../audit/service/audit.service";
import { requireJwtSecret, requireOtpSecret } from "../../../utils/security";
import { PostRepository } from "../../posts/repository/post.repository";
import { PostCommentRepository } from "../../posts/repository/comment.repository";
import { FollowRepository } from "../../follow/repository/follow.repository";

const userRepository: UserRepositoryInterface = new UserRepository();
const postRepository = new PostRepository();
const commentRepository = new PostCommentRepository();
const followRepository = new FollowRepository();
dotenv.config();
const CLIENT_URL = process.env.CLIENT_URL as string;

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_ATTEMPT_LIMIT = 5;
const PASSWORD_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;
const PASSWORD_HISTORY_LIMIT = 5;

function jwtSecret() {
  return requireJwtSecret();
}

function hashOtp(otp: string) {
  return crypto.createHmac("sha256", requireOtpSecret()).update(otp).digest("hex");
}

function createNumericOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function assertOtp(codeHash?: string, expires?: Date, otp?: string) {
  if (!otp || !codeHash || !expires || expires.getTime() < Date.now()) {
    throw new HttpError(400, "Invalid or expired OTP");
  }
  if (hashOtp(otp) !== codeHash) {
    throw new HttpError(400, "Invalid or expired OTP");
  }
}

export class UserService {
  // Helper function: Filter user object to exclude secrets and Mongoose metadata before returning it to clients.
  private sanitizeUser(user: IUser) {
    const userObj = user.toObject();
    const {
      password,
      __v,
      otpSecret,
      pendingOtpSecret,
      passwordHistory,
      emailVerificationCode,
      emailVerificationExpires,
      emailVerificationAttempts,
      resetPasswordCode,
      resetPasswordExpires,
      resetPasswordAttempts,
      mfaFailedAttempts,
      ...safeUser
    } = userObj;
    return safeUser;
  }

  private async sendVerificationEmail(user: IUser) {
    const otp = createNumericOtp();
    await userRepository.updateUser(user._id.toString(), {
      emailVerificationCode: hashOtp(otp),
      emailVerificationExpires: new Date(Date.now() + OTP_TTL_MS),
      emailVerificationAttempts: 0,
    });

    // Email OTP verifies account ownership before protected access, reducing fake-account and mailbox takeover risk.
    await sendEmail(
      user.email,
      "Verify your Quill account",
      `<p>Your Quill verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
    );
  }

  private async recordFailedLogin(user: IUser) {
    const nextCount = (user.failedLoginAttempts || 0) + 1;
    const lockUntil = nextCount >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MS) : null;

    await userRepository.updateUser(user._id.toString(), {
      failedLoginAttempts: nextCount,
      lockUntil,
    });

    if (lockUntil) {
      logger.warn("Account locked after failed login attempts", { userId: user._id.toString() });
    }
  }

  private async ensurePasswordNotReused(user: IUser, newPassword: string) {
    const hashes = [user.password, ...(user.passwordHistory || [])].filter(Boolean);
    for (const hash of hashes) {
      if (await bcrypt.compare(newPassword, hash)) {
        throw new HttpError(400, "Choose a password you have not used recently");
      }
    }
  }

  private async assertCurrentPassword(user: IUser, currentPassword: string) {
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      // Step-up auth defense: sensitive account changes require fresh proof of the user's password.
      throw new HttpError(401, "Current password is incorrect");
    }
  }

  private async applyNewPassword(user: IUser, newPassword: string) {
    await this.ensurePasswordNotReused(user, newPassword);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const previous = [user.password, ...(user.passwordHistory || [])].filter(Boolean).slice(0, PASSWORD_HISTORY_LIMIT - 1);

    return userRepository.updateUser(user._id.toString(), {
      password: hashedPassword,
      passwordHistory: previous,
      lastPasswordChange: new Date(),
      sessionVersion: (user.sessionVersion || 0) + 1,
      failedLoginAttempts: 0,
      lockUntil: null,
      resetPasswordCode: undefined,
      resetPasswordExpires: undefined,
      resetPasswordAttempts: 0,
    });
  }

  async createUser(data: Omit<RegisterUserDTO, "recaptchaToken">, context?: { ip?: string; userAgent?: string }) {
    const existingUser = await userRepository.findByEmailOrUsername(
      data.email.toLowerCase(),
      data.username,
    );

    if (existingUser) {
      throw new HttpError(409, "User with this email or username already exists");
    }

    // Passwords are bcrypt-hashed before storage so a database leak does not expose plaintext credentials.
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await userRepository.createUser({
      fullName: data.fullName,
      username: data.username,
      email: data.email.toLowerCase(),
      password: hashedPassword,
      passwordHistory: [],
      isVerified: false,
    });

    await this.sendVerificationEmail(user);
    await auditActivity({ userId: user._id.toString(), action: "user.registered", ...context });
    return this.sanitizeUser(user);
  }

  async loginUser(email: string, password: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserByEmailWithSecrets(email);

    if (!user) {
      throw new HttpError(401, "Invalid credentials");
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      // Per-account lockout complements IP rate limiting and still works when attackers rotate IPs.
      throw new HttpError(423, "Account temporarily locked. Try again later.");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await this.recordFailedLogin(user);
      await auditActivity({ userId: user._id.toString(), action: "user.login_failed", ...context });
      throw new HttpError(401, "Invalid credentials");
    }

    if (!user.isVerified) {
      throw new HttpError(403, "Please verify your email before logging in");
    }

    if (Date.now() - new Date(user.lastPasswordChange).getTime() > PASSWORD_EXPIRY_MS) {
      throw new HttpError(403, "Password expired. Reset your password before logging in.");
    }

    await userRepository.updateUser(user._id.toString(), {
      failedLoginAttempts: 0,
      lockUntil: null,
    });

    if (user.otpEnabled) {
      // MFA users receive only a short-lived challenge token until their TOTP code is verified.
      const mfaToken = jwt.sign({ id: user._id.toString(), purpose: "mfa" }, jwtSecret(), { expiresIn: "5m" });
      await auditActivity({ userId: user._id.toString(), action: "user.login_mfa_required", ...context });
      return { requiresOtp: true, mfaToken, user: this.sanitizeUser(user) };
    }

    const token = this.createSessionToken(user);
    await auditActivity({ userId: user._id.toString(), action: "user.login_success", ...context });
    return { token, user: this.sanitizeUser(user), requiresOtp: false };
  }

  async loginOAuthUser(userId: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserWithSecrets(userId);
    if (!user) throw new HttpError(401, "OAuth login failed");
    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      throw new HttpError(423, "Account temporarily locked. Try again later.");
    }
    if (!user.isVerified) {
      throw new HttpError(403, "Please verify your email before logging in");
    }
    if (Date.now() - new Date(user.lastPasswordChange).getTime() > PASSWORD_EXPIRY_MS) {
      throw new HttpError(403, "Password expired. Reset your password before logging in.");
    }

    await userRepository.updateUser(user._id.toString(), {
      failedLoginAttempts: 0,
      lockUntil: null,
    });

    if (user.otpEnabled) {
      // OAuth must not bypass MFA; linked Google accounts get the same short-lived challenge as password logins.
      const mfaToken = jwt.sign({ id: user._id.toString(), purpose: "mfa" }, jwtSecret(), { expiresIn: "5m" });
      await auditActivity({ userId: user._id.toString(), action: "user.oauth_mfa_required", ...context });
      return { requiresOtp: true, mfaToken, user: this.sanitizeUser(user) };
    }

    await auditActivity({ userId: user._id.toString(), action: "user.oauth_login_success", ...context });
    return { token: this.createSessionToken(user), user: this.sanitizeUser(user), requiresOtp: false };
  }

  createSessionToken(user: IUser) {
    return jwt.sign(
      {
        id: user._id.toString(),
        role: user.role,
        sessionVersion: user.sessionVersion || 0,
      },
      jwtSecret(),
      { expiresIn: "15d" },
    );
  }

  async verifyLoginOtp(mfaToken: string | undefined, otp: string, context?: { ip?: string; userAgent?: string }) {
    if (!mfaToken) throw new HttpError(401, "MFA challenge required");

    const decoded = jwt.verify(mfaToken, jwtSecret()) as { id: string; purpose: string };
    if (decoded.purpose !== "mfa") throw new HttpError(401, "Invalid MFA challenge");

    const user = await userRepository.getUserWithSecrets(decoded.id);
    if (!user || !user.otpSecret || !user.otpEnabled) {
      throw new HttpError(401, "MFA is not enabled");
    }
    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      throw new HttpError(423, "Account temporarily locked. Try again later.");
    }

    const valid = speakeasy.totp.verify({
      secret: user.otpSecret,
      encoding: "base32",
      token: otp,
      window: 1,
    });

    if (!valid) {
      const nextAttempts = (user.mfaFailedAttempts || 0) + 1;
      await userRepository.updateUser(user._id.toString(), {
        mfaFailedAttempts: nextAttempts,
        lockUntil: nextAttempts >= OTP_ATTEMPT_LIMIT ? new Date(Date.now() + LOCKOUT_MS) : user.lockUntil,
      });
      await auditActivity({ userId: user._id.toString(), action: "user.mfa_failed", ...context });
      throw new HttpError(401, nextAttempts >= OTP_ATTEMPT_LIMIT ? "Too many MFA attempts. Try again later." : "Invalid OTP");
    }

    await userRepository.updateUser(user._id.toString(), { mfaFailedAttempts: 0, lockUntil: null });
    await auditActivity({ userId: user._id.toString(), action: "user.mfa_success", ...context });
    return { token: this.createSessionToken(user), user: this.sanitizeUser(user) };
  }

  async setupMfa(userId: string, currentPassword: string) {
    const user = await userRepository.getUserWithSecrets(userId);
    if (!user) throw new HttpError(404, "User not found");
    await this.assertCurrentPassword(user, currentPassword);
    if (user.otpEnabled) throw new HttpError(400, "MFA is already enabled");

    const secret = speakeasy.generateSecret({
      name: `Quill (${user.email})`,
      issuer: "Quill",
    });

    await userRepository.updateUser(userId, { pendingOtpSecret: secret.base32, mfaFailedAttempts: 0 });
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url || "");

    // The pending TOTP secret is not activated until confirmMfa proves the user has enrolled it.
    return { qrCodeDataUrl, manualEntryKey: secret.base32 };
  }

  async confirmMfa(userId: string, otp: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserWithSecrets(userId);
    if (!user || !user.pendingOtpSecret) throw new HttpError(400, "Start MFA setup first");

    const valid = speakeasy.totp.verify({
      secret: user.pendingOtpSecret,
      encoding: "base32",
      token: otp,
      window: 1,
    });

    if (!valid) {
      const nextAttempts = (user.mfaFailedAttempts || 0) + 1;
      await userRepository.updateUser(userId, {
        mfaFailedAttempts: nextAttempts,
        pendingOtpSecret: nextAttempts >= OTP_ATTEMPT_LIMIT ? undefined : user.pendingOtpSecret,
      });
      throw new HttpError(400, nextAttempts >= OTP_ATTEMPT_LIMIT ? "Too many MFA attempts. Start setup again." : "Invalid OTP");
    }
    const updated = await userRepository.updateUser(userId, {
      otpSecret: user.pendingOtpSecret,
      pendingOtpSecret: undefined,
      otpEnabled: true,
      mfaFailedAttempts: 0,
      sessionVersion: (user.sessionVersion || 0) + 1,
    });
    await auditActivity({ userId, action: "user.mfa_enabled", ...context });
    return updated ? this.sanitizeUser(updated) : null;
  }

  async disableMfa(userId: string, otp: string, currentPassword: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserWithSecrets(userId);
    if (!user || !user.otpSecret || !user.otpEnabled) throw new HttpError(400, "MFA is not enabled");
    await this.assertCurrentPassword(user, currentPassword);

    const valid = speakeasy.totp.verify({
      secret: user.otpSecret,
      encoding: "base32",
      token: otp,
      window: 1,
    });

    if (!valid) {
      const nextAttempts = (user.mfaFailedAttempts || 0) + 1;
      await userRepository.updateUser(userId, { mfaFailedAttempts: nextAttempts });
      throw new HttpError(400, nextAttempts >= OTP_ATTEMPT_LIMIT ? "Too many MFA attempts. Try again later." : "Invalid OTP");
    }
    const updated = await userRepository.updateUser(userId, {
      otpEnabled: false,
      otpSecret: undefined,
      pendingOtpSecret: undefined,
      mfaFailedAttempts: 0,
      sessionVersion: (user.sessionVersion || 0) + 1,
    });
    await auditActivity({ userId, action: "user.mfa_disabled", ...context });
    return updated ? this.sanitizeUser(updated) : null;
  }

  async verifyEmail(email: string, otp: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserByEmailWithSecrets(email);
    if (!user) throw new HttpError(400, "Invalid or expired OTP");
    if ((user.emailVerificationAttempts || 0) >= OTP_ATTEMPT_LIMIT) {
      throw new HttpError(429, "Too many verification attempts. Request a new OTP.");
    }

    try {
      assertOtp(user.emailVerificationCode, user.emailVerificationExpires, otp);
    } catch (error) {
      const nextAttempts = (user.emailVerificationAttempts || 0) + 1;
      await userRepository.updateUser(user._id.toString(), {
        emailVerificationAttempts: nextAttempts,
        emailVerificationCode: nextAttempts >= OTP_ATTEMPT_LIMIT ? undefined : user.emailVerificationCode,
        emailVerificationExpires: nextAttempts >= OTP_ATTEMPT_LIMIT ? undefined : user.emailVerificationExpires,
      });
      throw error;
    }
    const updated = await userRepository.updateUser(user._id.toString(), {
      isVerified: true,
      emailVerificationCode: undefined,
      emailVerificationExpires: undefined,
      emailVerificationAttempts: 0,
    });
    await auditActivity({ userId: user._id.toString(), action: "user.email_verified", ...context });
    return updated ? this.sanitizeUser(updated) : null;
  }

  async resendVerificationEmail(email: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserByEmail(email.toLowerCase());
    if (!user) return null;
    if (user.isVerified) return this.sanitizeUser(user);

    await this.sendVerificationEmail(user);
    await auditActivity({ userId: user._id.toString(), action: "user.email_verification_resent", ...context });
    return this.sanitizeUser(user);
  }

  async updateUser(userId: string, data: ProfileEditDTO, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserWithSecrets(userId);
    if (!user) throw new HttpError(404, "User not found");

    // Mass assignment protection: profile edits may not set role, password, verification, or MFA fields.
    const { role, currentPassword, ...safeData } = data;
    const nextEmail = safeData.email?.toLowerCase();
    const emailChanged = Boolean(nextEmail && nextEmail !== user.email);

    if (safeData.email || safeData.username) {
      const existingUser = await userRepository.findByEmailOrUsername(
        nextEmail ?? "",
        safeData.username ?? "",
      );

      if (existingUser && existingUser._id.toString() !== userId) {
        throw new HttpError(409, "Email or username already in use");
      }
    }

    if (emailChanged) {
      if (!currentPassword) throw new HttpError(400, "Current password is required to change email");
      await this.assertCurrentPassword(user, currentPassword);
    }

    const updatedUser = await userRepository.updateUser(userId, {
      ...safeData,
      email: nextEmail ?? safeData.email,
      ...(emailChanged
        ? {
            isVerified: false,
            sessionVersion: (user.sessionVersion || 0) + 1,
          }
        : {}),
    });
    if (!updatedUser) throw new HttpError(500, "Failed to update user");

    if (emailChanged) {
      await this.sendVerificationEmail(updatedUser);
      await auditActivity({ userId, action: "user.email_change_requested", ...context });
    }

    await auditActivity({ userId, action: "user.profile_updated", ...context });
    return this.sanitizeUser(updatedUser);
  }

  async updateUserAsAdmin(userId: string, data: EditUserDTO, context?: { ip?: string; userAgent?: string; actorId?: string }) {
    const user = await userRepository.getUserById(userId);
    if (!user) throw new HttpError(404, "User not found");

    const { role, ...safeData } = data;
    const nextEmail = safeData.email?.toLowerCase();
    const emailChanged = Boolean(nextEmail && nextEmail !== user.email);

    if (safeData.email || safeData.username) {
      const existingUser = await userRepository.findByEmailOrUsername(
        nextEmail ?? "",
        safeData.username ?? "",
      );

      if (existingUser && existingUser._id.toString() !== userId) {
        throw new HttpError(409, "Email or username already in use");
      }
    }

    const updatedUser = await userRepository.updateUser(userId, {
      ...safeData,
      email: nextEmail ?? safeData.email,
      ...(emailChanged
        ? {
            isVerified: false,
            sessionVersion: (user.sessionVersion || 0) + 1,
          }
        : {}),
    });
    if (!updatedUser) throw new HttpError(500, "Failed to update user");

    if (emailChanged) await this.sendVerificationEmail(updatedUser);
    await auditActivity({
      userId: context?.actorId,
      action: "admin.user_updated",
      metadata: { targetUserId: userId },
      ip: context?.ip,
      userAgent: context?.userAgent,
    });
    return this.sanitizeUser(updatedUser);
  }

  async changePassword(userId: string, data: ChangePasswordDTO, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserWithSecrets(userId);
    if (!user) throw new HttpError(404, "User not found");

    const valid = await bcrypt.compare(data.currentPassword, user.password);
    if (!valid) throw new HttpError(401, "Current password is incorrect");

    const updated = await this.applyNewPassword(user, data.newPassword);
    await auditActivity({ userId, action: "user.password_changed", ...context });
    return updated ? this.createSessionToken(updated) : null;
  }

  async getAllUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const users = await userRepository.getAllUsers(skip, limit);
    return users.map((user) => this.sanitizeUser(user));
  }

  async getUserById(userId: string) {
    const user = await userRepository.getUserById(userId);
    if (!user) throw new HttpError(404, "User not found");
    return this.sanitizeUser(user);
  }

  async getPublicUserById(userId: string) {
    const user = await userRepository.getPublicUserById(userId);
    if (!user) throw new HttpError(404, "User not found");
    return this.sanitizeUser(user);
  }

  async getUserByUsername(username: string) {
    const user = await userRepository.getUserByUsername(username);
    if (!user) throw new HttpError(404, "User not found");
    return this.sanitizeUser(user);
  }

  async deleteUser(userId: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserById(userId);
    if (!user) throw new HttpError(404, "User not found");

    const authoredPostIds = await postRepository.getPostIdsByUser(userId);
    const commentCounts = await commentRepository.getCommentCountsByUser(userId);
    await commentRepository.deleteCommentsByUser(userId);
    await commentRepository.deleteCommentsByPostIds(authoredPostIds);
    await commentRepository.removeLikesByUser(userId);
    await postRepository.deletePostsByUser(userId);
    await postRepository.removeLikesByUser(userId);
    await postRepository.decreaseCommentCounts(userId, commentCounts);
    await followRepository.deleteFollowsForUser(userId);
    await userRepository.deleteUser(userId);
    await auditActivity({ userId, action: "user.deleted", ...context });
    return { message: "User deleted successfully" };
  }

  async invalidateSessions(userId: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserById(userId);
    if (!user) return;

    // Incrementing sessionVersion invalidates older JWTs without needing to store raw tokens server-side.
    await userRepository.updateUser(userId, { sessionVersion: (user.sessionVersion || 0) + 1 });
    await auditActivity({ userId, action: "user.logout", ...context });
  }

  async sendResetPasswordEmail(email?: string, context?: { ip?: string; userAgent?: string }) {
    if (!email) {
      throw new HttpError(400, "Email is required");
    }
    const user = await userRepository.getUserByEmail(email.toLowerCase());
    if (!user) {
      // Generic response behavior should be handled by the controller; this avoids user enumeration.
      return null;
    }
    const otp = createNumericOtp();
    await userRepository.updateUser(user._id.toString(), {
      resetPasswordCode: hashOtp(otp),
      resetPasswordExpires: new Date(Date.now() + OTP_TTL_MS),
      resetPasswordAttempts: 0,
    });

    const html = `<p>Your Quill password reset OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p><p>Open ${CLIENT_URL}/reset-password to use it.</p>`;
    await sendEmail(user.email, "Password Reset", html);
    await auditActivity({ userId: user._id.toString(), action: "user.password_reset_requested", ...context });
    return user;
  }

  async resetPassword(email?: string, otp?: string, newPassword?: string, context?: { ip?: string; userAgent?: string }) {
    if (!email || !otp || !newPassword) {
      throw new HttpError(400, "Email, OTP, and new password are required");
    }

    const passwordCheck = PasswordPolicySchema.safeParse(newPassword);
    if (!passwordCheck.success) {
      throw new HttpError(400, passwordCheck.error.issues[0]?.message || "Password does not meet policy");
    }

    const user = await userRepository.getUserByEmailWithSecrets(email.toLowerCase());
    if (!user) throw new HttpError(400, "Invalid or expired OTP");
    if ((user.resetPasswordAttempts || 0) >= OTP_ATTEMPT_LIMIT) {
      throw new HttpError(429, "Too many reset attempts. Request a new OTP.");
    }

    try {
      assertOtp(user.resetPasswordCode, user.resetPasswordExpires, otp);
    } catch (error) {
      const nextAttempts = (user.resetPasswordAttempts || 0) + 1;
      await userRepository.updateUser(user._id.toString(), {
        resetPasswordAttempts: nextAttempts,
        resetPasswordCode: nextAttempts >= OTP_ATTEMPT_LIMIT ? undefined : user.resetPasswordCode,
        resetPasswordExpires: nextAttempts >= OTP_ATTEMPT_LIMIT ? undefined : user.resetPasswordExpires,
      });
      throw error;
    }
    await this.applyNewPassword(user, newPassword);
    await auditActivity({ userId: user._id.toString(), action: "user.password_reset_completed", ...context });
    return user;
  }

  async exportMyData(userId: string, context?: { ip?: string; userAgent?: string }) {
    const user = await userRepository.getUserById(userId);
    if (!user) throw new HttpError(404, "User not found");

    await auditActivity({ userId, action: "user.data_exported", ...context });
    // Privacy export intentionally excludes password hashes, OTP secrets, and one-time codes.
    return {
      exportedAt: new Date().toISOString(),
      user: this.sanitizeUser(user),
    };
  }

  async importMyData(userId: string, data: Pick<EditUserDTO, "fullName" | "bio" | "avatarUrl">, context?: { ip?: string; userAgent?: string }) {
    const updated = await userRepository.updateUser(userId, {
      fullName: data.fullName,
      bio: data.bio,
      avatarUrl: data.avatarUrl,
    });
    if (!updated) throw new HttpError(404, "User not found");

    await auditActivity({ userId, action: "user.data_imported", ...context });
    return this.sanitizeUser(updated);
  }
}
