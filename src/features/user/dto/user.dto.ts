import { z } from "zod";
import { UserSchema } from "../type/user.type";

export const PasswordPolicySchema = z
  .string()
  .min(8, "Passwords must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

// The DTO [Data transfer Object] defines what values are needed for certain operations
// For registration the following are necessary
export const RegisterUserDTO = UserSchema.pick({
  fullName: true,
  username: true,
  email: true,
  password: true,
}).extend({
  // Backend password complexity is authoritative; frontend strength feedback is only a UX helper.
  password: PasswordPolicySchema,
  // reCAPTCHA is verified server-side so clients cannot bypass bot checks by hiding the widget.
  recaptchaToken: z.string().min(1, "Complete the reCAPTCHA challenge"),
}); // Backend requires only the real password; confirmPassword is a frontend-only UX check if used.
export type RegisterUserDTO = z.infer<typeof RegisterUserDTO>;

export const LoginUserDTO = UserSchema.pick({
  email: true,
  password: true,
}).extend({
  // Login requires a fresh Google token to slow credential-stuffing automation before password checks run.
  recaptchaToken: z.string().min(1, "Complete the reCAPTCHA challenge"),
});
export type LoginUserDTO = z.infer<typeof LoginUserDTO>;

export const EditUserDTO = UserSchema.pick({
  fullName: true,
  username: true,
  email: true,
  bio: true,
  avatarUrl: true,
  role: true,
}).partial(); // doesnt ask user to insert all field when editing
export type EditUserDTO = z.infer<typeof EditUserDTO>;

export const ChangePasswordDTO = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: PasswordPolicySchema,
});
export type ChangePasswordDTO = z.infer<typeof ChangePasswordDTO>;

export const ResetPasswordDTO = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  // Password reset is a backend-enforced credential change, so it must use the same policy as registration/change-password.
  newPassword: PasswordPolicySchema,
});
export type ResetPasswordDTO = z.infer<typeof ResetPasswordDTO>;

export const OtpDTO = z.object({
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});
export type OtpDTO = z.infer<typeof OtpDTO>;

export const VerifyEmailDTO = OtpDTO.extend({
  email: z.string().email(),
});
export type VerifyEmailDTO = z.infer<typeof VerifyEmailDTO>;
