import { z } from "zod";
import { storedTextSchema } from "../../../utils/xss";

export const PostCommentSchema = z.object({
  userId: z.string().optional(),
  postId: z.string().optional(),
  // Stored XSS prevention: comments are stored and rendered under posts, so HTML/script-like payloads are rejected server-side.
  commentText: storedTextSchema("Comment", 2000),
  likeCount: z.number().default(0),
});

export type PostComment = z.infer<typeof PostCommentSchema>;
