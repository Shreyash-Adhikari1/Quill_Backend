import z from "zod";
import { PostSchema } from "../type/post.type";

// Create Post DTO
export const CreatePostDTO = PostSchema.pick({
  postTitle: true,
  postContent: true,
  visibility: true,
});

export type CreatePostDTO = z.infer<typeof CreatePostDTO>;

// Edit post DTO
export const EditPostDTO = PostSchema.pick({
  postTitle: true,
  postContent: true,
  visibility: true,
}).partial();

export type EditPostDTO = z.infer<typeof EditPostDTO>;
