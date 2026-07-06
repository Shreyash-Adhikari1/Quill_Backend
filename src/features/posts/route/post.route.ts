import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { PostController } from "../controller/post.controller";

const postRouter = Router();
const postController = new PostController();

// Create and Edit routes
postRouter.post(
  "/create",
  authMiddleware,
  postController.createPost,
);
postRouter.patch("/edit/:postId", authMiddleware, postController.editPost);

// Fetch Routes
postRouter.get("/posts", authMiddleware, postController.getFeed);
postRouter.get(
  "/posts/following",
  authMiddleware,
  postController.getFollowingFeed,
);
postRouter.get("/posts/my-posts", authMiddleware, postController.getMyPosts);
postRouter.get(
  "/posts/user/:userId",
  authMiddleware,
  postController.getPostsByUser,
);

// Delete Routes
postRouter.delete("/delete/:postId", authMiddleware, postController.deletePost);
// postRouter.delete("/delete/:postId", (req, res) => {
//     res.send("DELETE ROUTE HIT");
// });

// like and unlike routes

postRouter.post("/like/:postId", authMiddleware, postController.likePost);
postRouter.post("/unlike/:postId", authMiddleware, postController.unlikePost);

export default postRouter;
