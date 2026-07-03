import crypto from "crypto";

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
