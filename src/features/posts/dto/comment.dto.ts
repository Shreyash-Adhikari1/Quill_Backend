import z from "zod";
import { PostCommentSchema } from "../type/comment.type";

export const CommentDTO = PostCommentSchema.pick({
  commentText: true,
});
export type CommentDTO = z.infer<typeof CommentDTO>;
