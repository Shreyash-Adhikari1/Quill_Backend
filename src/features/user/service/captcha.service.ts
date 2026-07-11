import crypto from "crypto";
import axios from "axios";
import logger from "../../../utils/logger";

type CaptchaChallenge = {
  answerHash: string;
  expiresAt: number;
};

const challenges = new Map<string, CaptchaChallenge>();
const TTL_MS = 10 * 60 * 1000;

function hashAnswer(answer: number) {
  return crypto.createHash("sha256").update(String(answer)).digest("hex");
}

export function createCaptchaChallenge() {
  const left = crypto.randomInt(2, 10);
  const right = crypto.randomInt(2, 10);
  const id = crypto.randomUUID();

  // The CAPTCHA challenge slows simple scripted auth abuse without sending the answer to the browser.
  challenges.set(id, {
    answerHash: hashAnswer(left + right),
    expiresAt: Date.now() + TTL_MS,
  });

  return {
    captchaId: id,
    question: `${left} + ${right}`,
  };
}

export function verifyCaptchaChallenge(captchaId?: string, answer?: string) {
  if (!captchaId || !answer) return false;

  const challenge = challenges.get(captchaId);
  challenges.delete(captchaId);

  if (!challenge || challenge.expiresAt < Date.now()) return false;
  return challenge.answerHash === hashAnswer(Number(answer));
}

type RecaptchaVerifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  score?: number;
  "error-codes"?: string[];
};

export async function verifyRecaptchaToken(token: string | undefined, remoteIp?: string, expectedAction?: string) {
  if (!token) return false;

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    // Missing secret must fail closed so deployments do not silently run without bot protection.
    logger.warn("reCAPTCHA secret is not configured");
    return false;
  }

  if (process.env.NODE_ENV === "test" && token === "test-recaptcha-token") {
    // Test-only bypass keeps automated tests deterministic without weakening real environments.
    return true;
  }

  const payload = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    // Supplying the client IP gives Google one more signal for bot-risk evaluation.
    payload.set("remoteip", remoteIp);
  }

  try {
    const response = await axios.post<RecaptchaVerifyResponse>(
      "https://www.google.com/recaptcha/api/siteverify",
      payload,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
      },
    );

    const result = response.data;
    const actionMatches = !result.action || !expectedAction || result.action.toUpperCase() === expectedAction.toUpperCase();
    const expectedHostname = process.env.RECAPTCHA_EXPECTED_HOSTNAME;
    if (process.env.NODE_ENV === "production" && !expectedHostname) {
      // Production bot protection must be bound to the expected host; otherwise stolen tokens from other sites are harder to spot.
      logger.warn("reCAPTCHA expected hostname is not configured");
      return false;
    }
    const hostnameMatches = !expectedHostname || result.hostname === expectedHostname;
    const minScore = Number(process.env.RECAPTCHA_MIN_SCORE || "");
    if (process.env.NODE_ENV === "production" && !Number.isFinite(minScore)) {
      // Score-based deployments need an explicit threshold so bot checks do not silently degrade.
      logger.warn("reCAPTCHA minimum score is not configured");
      return false;
    }
    const scoreMatches = !Number.isFinite(minScore) || typeof result.score !== "number" || result.score >= minScore;

    if (!result.success || !actionMatches || !hostnameMatches || !scoreMatches) {
      // Logs only metadata and error codes, never the token or secret.
      logger.warn("reCAPTCHA verification failed", {
        action: result.action,
        expectedAction,
        hostname: result.hostname,
        expectedHostname,
        score: result.score,
        minScore: Number.isFinite(minScore) ? minScore : undefined,
        errors: result["error-codes"],
      });
      return false;
    }

    return true;
  } catch (error) {
    // Network/provider failures block protected auth actions rather than allowing bot traffic through.
    logger.warn("reCAPTCHA verification request failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return false;
  }
}
