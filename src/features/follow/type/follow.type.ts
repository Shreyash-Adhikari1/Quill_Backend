import z from "zod";

export const FollowSchema = z.object({
  follower: z.string(),
  following: z.string(),
  isFollowActive: z.boolean().default(false),
});
export type Follow = z.infer<typeof FollowSchema>;
