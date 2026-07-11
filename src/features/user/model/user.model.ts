import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  fullName: string;
  username: string;
  email: string;
  password: string;
  role: "user" | "admin";
  bio?: string;
  avatarUrl?: string;
  googleId?: string;
  otpSecret?: string;
  pendingOtpSecret?: string;
  otpEnabled: boolean;
  mfaFailedAttempts: number;
  failedLoginAttempts: number;
  lockUntil: Date | null;
  passwordHistory: string[];
  lastPasswordChange: Date;
  sessionVersion: number;
  isVerified: boolean;
  emailVerificationCode?: string;
  emailVerificationExpires?: Date;
  emailVerificationAttempts: number;
  resetPasswordCode?: string;
  resetPasswordExpires?: Date;
  resetPasswordAttempts: number;
  followerCount: number;
  followingCount: number;
  postCount: number;
  posts: mongoose.Types.ObjectId[];
}

const UserSchema: Schema<IUser> = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    bio: { type: String },
    avatarUrl: { type: String },
    // Stores the Google OAuth provider ID for Google sign-ins; sparse avoids index conflicts for password users without googleId.
    googleId: { type: String, sparse: true },
    // Stores the base32 TOTP secret; select:false prevents accidental exposure in normal queries.
    otpSecret: { type: String, select: false },
    // Stores a not-yet-confirmed TOTP secret separately so setup cannot replace active MFA until the OTP is proven.
    pendingOtpSecret: { type: String, select: false },
    // Tracks whether OTP/2FA is enabled so login can require a second verification factor.
    otpEnabled: { type: Boolean, default: false },
    // Counts failed MFA verification attempts to slow online OTP guessing.
    mfaFailedAttempts: { type: Number, default: 0 },
    // Counts consecutive failed logins for per-account brute-force protection even when attackers rotate IPs.
    failedLoginAttempts: { type: Number, default: 0 },
    // Temporarily locks an account until this time, preventing permanent lockout denial-of-service.
    lockUntil: { type: Date, default: null },
    // Stores the previous bcrypt hashes for password reuse prevention while keeping them hidden by default.
    passwordHistory: [{ type: String, select: false }],
    // Records the last password change time for password expiry policy checks.
    lastPasswordChange: { type: Date, default: Date.now },
    // Session version is embedded in JWTs so logout/password changes can invalidate previously issued stateless tokens.
    sessionVersion: { type: Number, default: 0 },
    // Requires users to verify their email before accessing protected routes, reducing fake-account abuse.
    isVerified: { type: Boolean, default: false },
    // Stores a hashed email verification OTP only temporarily; select:false prevents accidental exposure.
    emailVerificationCode: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    // Counts verification OTP failures per account/purpose, not just per source IP.
    emailVerificationAttempts: { type: Number, default: 0 },
    // Stores a hashed reset OTP only temporarily, avoiding long-lived reset links in application data.
    resetPasswordCode: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    // Counts reset OTP failures per account so distributed IP guessing still gets stopped.
    resetPasswordAttempts: { type: Number, default: 0 },
    followerCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    postCount: { type: Number, default: 0 },
    posts: [{ type: Schema.Types.ObjectId, ref: "Post", index: true }],
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
