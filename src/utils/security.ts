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

export function oauthStateCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: secureCookieEnabled(),
    // OAuth returns from google.com as a top-level cross-site navigation. Lax
    // sends this CSRF state cookie on that callback while still excluding it
    // from cross-site subrequests and form posts.
    sameSite: "lax",
    maxAge,
  };
}

export function clearOAuthStateCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: secureCookieEnabled(),
    sameSite: "lax",
  };
}
