import { z } from "zod";
import { storedTextSchema } from "../../../utils/xss";

export const PostSchema = z.object({
  _id: z.string().optional(),
  author: z.string().optional(),
  // Stored XSS prevention: notes are stored and rendered later, so the backend rejects HTML/script payloads before persistence.
  postTitle: storedTextSchema("Post title", 140),
  // Stored XSS prevention: Quill notes are plain text; rich HTML is intentionally not accepted from API clients.
  postContent: storedTextSchema("Post content", 10000),
  visibility: z.enum(["public", "followers", "private"]).default("public"),
  likeCount: z.number().default(0),
  commentCount: z.number().default(0),
  isDeleted: z.boolean().default(false),
});

export type Post = z.infer<typeof PostSchema>;
