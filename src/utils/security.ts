import { CookieOptions } from "express";

export function requireJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_TOKEN;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
}

export function requireOtpSecret() {
  const secret = process.env.OTP_PEPPER || process.env.JWT_SECRET || process.env.JWT_SECRET_TOKEN;
  if (!secret) {
    throw new Error("OTP_PEPPER or JWT_SECRET is required");
  }
  return secret;
}

export function secureCookieEnabled() {
  return process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
}

export function strictCookieOptions(maxAge: number, httpOnly = true): CookieOptions {
  return {
    httpOnly,
    secure: secureCookieEnabled(),
    sameSite: "strict",
    maxAge,
  };
}

export function clearStrictCookieOptions(httpOnly = true): CookieOptions {
  return {
    httpOnly,
    secure: secureCookieEnabled(),
    sameSite: "strict",
  };
}
