import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { UserModel } from "../model/user.model";
import { cleanOAuthDisplayName } from "../../../utils/xss";
import {
  clearOAuthStateCookieOptions,
  oauthStateCookieOptions,
  strictCookieOptions,
} from "../../../utils/security";
import { UserService } from "../service/user.service";
import logger from "../../../utils/logger";

const authRouter = Router();
const userService = new UserService();

type GoogleUser = {
  _id: unknown;
};

function makeUsername(profile: Profile, email: string) {
  const base = (email.split("@")[0] || profile.displayName || "writer")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);

  return `${base || "writer"}_${profile.id.slice(-6)}`;
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.SERVER_URL || "https://localhost:5000"}/api/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(new Error("Google account did not provide an email"));
          if ((profile._json as any)?.email_verified === false) {
            return done(new Error("Google account email is not verified"));
          }

          let user = await UserModel.findOne({ googleId: profile.id }).exec();
          if (!user) {
            user = await UserModel.findOne({ email }).exec();
          }

          if (user) {
            if (!user.googleId) {
              user.googleId = profile.id;
              await user.save();
            }
            return done(null, user as GoogleUser);
          }

          const generatedPassword = await bcrypt.hash(`google:${profile.id}:${Date.now()}`, 10);
          const createdUser = await UserModel.create({
            // Stored XSS prevention: provider-supplied display names are normalized before being stored and rendered in profiles/feed.
            fullName: cleanOAuthDisplayName(profile.displayName || email.split("@")[0]),
            username: makeUsername(profile, email),
            email,
            password: generatedPassword,
            googleId: profile.id,
            isVerified: true,
          });

          return done(null, createdUser as GoogleUser);
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );
}

authRouter.get("/google", (req, res, next) => {
  // Google OAuth must be a full browser navigation, not fetch/XHR. The backend
  // owns this redirect flow so it can set the httpOnly JWT cookie after callback.
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).send("Google OAuth is not configured on the backend.");
  }

  const state = crypto.randomBytes(32).toString("hex");
  res.cookie("oauth-state", state, oauthStateCookieOptions(5 * 60 * 1000)); // OAuth CSRF defense: callback must echo this server-issued state.

  return passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    state,
  })(req, res, next);
});

authRouter.get("/google/callback", (req, res, next) => {
  const cookieState = req.cookies?.["oauth-state"];
  const queryState = req.query.state;
  if (typeof cookieState !== "string" || typeof queryState !== "string" || cookieState !== queryState) {
    return res.redirect(`${process.env.CLIENT_URL || "https://localhost:3000"}/login?oauth=state`);
  }

  passport.authenticate("google", { session: false }, async (error: Error | null, user?: GoogleUser) => {
    if (error || !user) {
      logger.error("Google OAuth callback authentication failed", {
        error: error?.message || "Google did not return an authenticated user",
      });
      res.clearCookie("oauth-state", clearOAuthStateCookieOptions());
      return res.redirect(`${process.env.CLIENT_URL || "https://localhost:3000"}/login?oauth=failed`);
    }

    try {
      const loginResult = await userService.loginOAuthUser(String(user._id), {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });

      res.clearCookie("oauth-state", clearOAuthStateCookieOptions());
      if (loginResult.requiresOtp && loginResult.mfaToken) {
        res.cookie("mfa-token", loginResult.mfaToken, strictCookieOptions(5 * 60 * 1000));
        return res.redirect(`${process.env.CLIENT_URL || "https://localhost:3000"}/verify-login-otp`);
      }

      res.cookie("token", loginResult.token, strictCookieOptions(7 * 24 * 60 * 60 * 1000)); // Same secure JWT cookie settings as password login.
      return res.redirect(`${process.env.CLIENT_URL || "https://localhost:3000"}/feed`);
    } catch (error) {
      logger.error("Google OAuth application login failed", {
        userId: String(user._id),
        error: error instanceof Error ? error.message : "Unknown OAuth login error",
      });
      res.clearCookie("oauth-state", clearOAuthStateCookieOptions());
      return res.redirect(`${process.env.CLIENT_URL || "https://localhost:3000"}/login?oauth=failed`);
    }
  })(req, res, next);
});

export default authRouter;
