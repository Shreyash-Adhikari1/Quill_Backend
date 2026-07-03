import { z } from "zod";

const HTML_TAG_PATTERN = /(?:<|&lt;|&#x?0*3c;)\s*\/?\s*[a-z][^>]*(?:>|&gt;|&#x?0*3e;)?/i;
const DANGEROUS_INLINE_PATTERN =
  /\b(?:on[a-z]+\s*=|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|srcdoc\s*=)/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const SAFE_UPLOAD_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}$/;

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
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }, "Avatar URL must be an http(s) URL or a safe uploaded filename")
  .optional();

export function cleanOAuthDisplayName(value: string) {
  const cleaned = value.replace(CONTROL_CHARACTER_PATTERN, "").replace(/[<>]/g, "").trim();
  return cleaned.slice(0, 80) || "Quill Writer";
}
