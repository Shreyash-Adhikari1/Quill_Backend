import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { FollowController } from "../controller/follow.controller";
const followRouter = Router();
const followController = new FollowController();

// follow and unfollow routes
followRouter.post(
  "/follow/:followingId",
  authMiddleware,
  followController.follow,
);
followRouter.post(
  "/unfollow/:followingId",
  authMiddleware,
  followController.unfollow,
);

// get routes
followRouter.get("/followers", authMiddleware, followController.getMyFollowers);
followRouter.get("/following", authMiddleware, followController.getMyFollowing);

followRouter.get(
  "/:userId/followers",
  authMiddleware,
  followController.getUsersFollowers,
);
followRouter.get(
  "/:userId/following",
  authMiddleware,
  followController.getUsersFollowing,
);

// check if follow exists route [frotnend required]
followRouter.get(
  "/is-following/:followingId",
  authMiddleware,
  followController.getIsFollowingStatus,
);

export default followRouter;
