import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { UserModel } from "../model/user.model";
import { cleanOAuthDisplayName } from "../../../utils/xss";

const authRouter = Router();

type GoogleUser = {
  _id: unknown;
  role: string;
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

  return passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
});

authRouter.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, (error: Error | null, user?: GoogleUser) => {
    if (error || !user) {
      return res.redirect(`${process.env.CLIENT_URL || "https://localhost:3000"}/login?oauth=failed`);
    }

    const token = jwt.sign(
      {
        id: String(user._id),
        role: user.role,
      },
      process.env.JWT_SECRET || process.env.JWT_SECRET_TOKEN!,
      { expiresIn: "10d" },
    );

    res.cookie("token", token, {
      httpOnly: true, // Prevents frontend JavaScript from reading the JWT after OAuth.
      secure: process.env.NODE_ENV === "production", // Use HTTPS-only cookies in production.
      sameSite: "strict", // Keeps the cookie off cross-site requests for CSRF defense in depth.
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(`${process.env.CLIENT_URL || "https://localhost:3000"}/feed`);
  })(req, res, next);
});

export default authRouter;
