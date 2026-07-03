import path from "path";
import authRouter from "./features/user/route/auth.route";
import adminRouter from "./features/admin/route/admin.route";
import followRouter from "./features/follow/route/follow.route";
import commentRouter from "./features/posts/route/comment.route";
import postRouter from "./features/posts/route/post.route";
import userRouter from "./features/user/route/user.route";
import express, { Application } from "express";
import passport from "passport";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { generateCSRFToken, globalErrorHandler, securityMiddleware, validateCSRFToken } from "./middleware";

const app: Application = express();

// Helmet, CORS, global rate limiting, and Mongo sanitization are mounted before routes to reduce OWASP header, CSRF, DoS, and NoSQL injection risks.
app.use(securityMiddleware);

// Static uploads are served from the project uploads folder so multer profile images render in the frontend.
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

// Middleware
// Explicit 100kb parser limits reduce request-flooding and memory-exhaustion DoS risk before data reaches controllers.
app.use(bodyParser.json({ limit: "100kb" }));
// URL-encoded requests are limited for the same DoS reason if forms or proxy tools submit this content type.
app.use(bodyParser.urlencoded({ extended: true, limit: "100kb" }));
// cookie-parser populates req.cookies before auth and CSRF middleware read httpOnly JWT and CSRF cookies.
app.use(cookieParser());
// CSRF validation runs after cookie parsing and before state-changing routes to block forged cross-site requests.
app.use(validateCSRFToken);
// Passport handles OAuth redirects; sessions stay disabled because auth uses httpOnly JWT cookies.
app.use(passport.initialize());

app.get("/api/health", (_req, res) => {
  return res.status(200).json({ success: true, message: "OK" });
});

app.get("/api/csrf-token", (req, res) => {
  // Issues a non-httpOnly CSRF token cookie so the frontend can echo it in X-CSRF-Token.
  const token = generateCSRFToken(req, res);
  return res.status(200).json({ csrfToken: token });
});

// Admin Routes
app.use("/api/admin", adminRouter);

// OAuth routes
app.use("/api/auth", authRouter);

// User Routes
app.use("/api/user", userRouter);

// Post Routes
app.use("/api/post", postRouter);
app.use("/api/comment", commentRouter);

// Follow Route
app.use("/api/follow", followRouter);

// Global error handling returns safe JSON for parser, upload, and unexpected failures without leaking stack traces.
app.use(globalErrorHandler);

export default app;
