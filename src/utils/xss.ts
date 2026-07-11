import { z } from "zod";
import net from "net";

const HTML_TAG_PATTERN = /(?:<|&lt;|&#x?0*3c;)\s*\/?\s*[a-z][^>]*(?:>|&gt;|&#x?0*3e;)?/i;
const DANGEROUS_INLINE_PATTERN =
  /\b(?:on[a-z]+\s*=|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|srcdoc\s*=)/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const SAFE_UPLOAD_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}$/;
const BLOCKED_URL_HOSTS = new Set(["localhost", "ip6-localhost", "ip6-loopback", "metadata.google.internal"]);

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateOrMetadataHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_URL_HOSTS.has(normalized) || normalized.endsWith(".localhost")) return true;
  if (normalized === "169.254.169.254") return true;

  const ipType = net.isIP(normalized);
  if (ipType === 4) return isPrivateIpv4(normalized);
  if (ipType === 6) {
    return normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
  }

  return false;
}

export function hasStoredXssPayload(value: string) {
  return (
    HTML_TAG_PATTERN.test(value) ||
    DANGEROUS_INLINE_PATTERN.test(value) ||
    CONTROL_CHARACTER_PATTERN.test(value)
  );
}

export function storedTextSchema(fieldName: string, maxLength: number, minLength = 1) {
  return z
    .string()
    .trim()
    .min(minLength, `${fieldName} is required`)
    .max(maxLength, `${fieldName} is too long`)
    .refine((value) => !hasStoredXssPayload(value), {
      // Stored XSS prevention: Quill stores these fields as plain text only, so HTML/script-like payloads are rejected before database writes.
      message: `${fieldName} cannot contain HTML, script content, or event-handler payloads`,
    });
}

export function optionalStoredTextSchema(fieldName: string, maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, `${fieldName} is too long`)
    .refine((value) => !hasStoredXssPayload(value), {
      // Stored XSS prevention: optional profile fields still cannot persist HTML/script payloads for later rendering.
      message: `${fieldName} cannot contain HTML, script content, or event-handler payloads`,
    })
    .optional();
}

export const safeAvatarUrlSchema = z
  .string()
  .trim()
  .max(2048, "Avatar URL is too long")
  .refine((value) => {
    if (!value) return true;
    if (hasStoredXssPayload(value)) return false;
    if (SAFE_UPLOAD_FILENAME_PATTERN.test(value) && !value.includes("/") && !value.includes("\\")) return true;

    try {
      const parsed = new URL(value);
      // Stored XSS prevention: avatar URLs must be http(s) only, blocking javascript:, data:, and SVG/script URL tricks.
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
      // SSRF-style guardrail: Quill does not fetch avatar URLs server-side, but still rejects obvious internal/metadata hosts.
      return !isPrivateOrMetadataHost(parsed.hostname);
    } catch {
      return false;
    }
  }, "Avatar URL must be a public http(s) URL or a safe uploaded filename")
  .optional();

export function cleanOAuthDisplayName(value: string) {
  const cleaned = value.replace(CONTROL_CHARACTER_PATTERN, "").replace(/[<>]/g, "").trim();
  return cleaned.slice(0, 80) || "Quill Writer";
}
