import { z } from "zod";
import { optionalStoredTextSchema, safeAvatarUrlSchema, storedTextSchema } from "../../../utils/xss";

// model for the app to use, doesnt require database.
export const UserSchema = z.object({
  _id: z.string().optional(),
  // Stored XSS prevention: names are rendered throughout feeds, profiles, comments, and admin pages, so they are plain text only.
  fullName: storedTextSchema("Full name", 80, 2),
  // Stored XSS prevention: usernames are also used in links, so restrict them to URL-safe account handles.
  username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/, "Username can only use letters, numbers, and underscores"),
  email: z.string().email(),
  password: z.string(),
  confirmPassword: z.string().optional(),
  role: z.enum(["user", "admin"]).default("user"),
  // Stored XSS prevention: bios are displayed on profile pages as plain text and must not persist HTML/script payloads.
  bio: optionalStoredTextSchema("Bio", 280),
  avatarUrl: safeAvatarUrlSchema,
  otpEnabled: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  followerCount: z.number().default(0),
  followingCount: z.number().default(0),
  postCount: z.number().default(0),
});

export type User = z.infer<typeof UserSchema>;
