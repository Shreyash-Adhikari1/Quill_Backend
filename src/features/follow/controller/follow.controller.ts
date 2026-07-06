import { Request, Response } from "express";
import { FollowService } from "../service/follow.service";
import { HttpError } from "../../../errors/http-error";

const followService = new FollowService();

export class FollowController {
  follow = async (req: Request, res: Response) => {
    try {
      const followerId = (req as any).user.id;
      if (!followerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized access denied" });
      }
      const { followingId } = req.params;
      if (!followingId) {
        return res
          .status(404)
          .json({ success: false, message: "User to follow not found" });
      }
      const follow = await followService.follow(
        followerId,
        followingId as string,
      );
      return res.status(200).json({
        success: true,
        message: "User Followed Successfully",
        data: { follower: follow?.follower, following: follow?.following },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  unfollow = async (req: Request, res: Response) => {
    try {
      const followerId = (req as any).user.id;
      if (!followerId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized || User unauthorized",
        });
      }
      const { followingId } = req.params;
      if (!followingId) {
        return res
          .status(400)
          .json({ success: false, message: "User to unfollow not found" });
      }

      const unfollow = await followService.unfollow(
        followerId,
        followingId as string,
      );
      return res.status(200).json({
        success: true,
        message: "User Unfollowed Successfully",
        data: {
          follower: unfollow?.follower,
          following: unfollow?.following,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };
  getMyFollowers = async (req: Request, res: Response) => {
    try {
      const viewerId = (req as any).user.id;
      if (!viewerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      // userId == viewerId
      const data = await followService.getFollowersWithViewerFlag(
        viewerId,
        viewerId,
      );

      return res.status(200).json({
        success: true,
        message: "Followers Fetched Successfully",
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getMyFollowing = async (req: Request, res: Response) => {
    try {
      const viewerId = (req as any).user.id;
      if (!viewerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const data = await followService.getFollowingWithViewerFlag(
        viewerId,
        viewerId,
      );

      return res.status(200).json({
        success: true,
        message: "Following Fetched Successfully",
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getUsersFollowers = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res
          .status(404)
          .json({ success: false, message: "user not found" });
      }

      // since your endpoint is not public, viewerId exists
      const viewerId = (req as any).user?.id;
      const data = await followService.getFollowersWithViewerFlag(
        userId as string,
        viewerId,
      );

      return res.status(200).json({
        success: true,
        message: "Users Followers Fetched Successfully",
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getUsersFollowing = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res
          .status(404)
          .json({ success: false, message: "user not found" });
      }

      const viewerId = (req as any).user?.id;
      const data = await followService.getFollowingWithViewerFlag(
        userId as string,
        viewerId,
      );

      return res.status(200).json({
        success: true,
        message: "Users Following Fetched Successfully",
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getIsFollowingStatus = async (req: Request, res: Response) => {
    try {
      const followerId = (req as any).user.id;
      if (!followerId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized || User unauthorized",
        });
      }
      const { followingId } = req.params;
      if (!followingId) {
        return res.status(404).json({
          success: false,
          message: "User to follow not found ",
        });
      }
      const isFollowing = await followService.isAlreadyFollowing(
        followerId,
        followingId as string,
      );
      return res.status(200).json({
        success: true,
        isFollowing,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };
}
