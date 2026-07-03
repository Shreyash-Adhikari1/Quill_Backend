import { IFollow } from "../model/follow.model";
import { FollowRepository } from "../repository/follow.repository";
import { UserRepository } from "../../user/repository/user.repository";
import { Types } from "mongoose";
import { HttpError } from "../../../errors/http-error";

const followRepository = new FollowRepository();
const userRepository = new UserRepository();

type FollowRowWithFlag = {
  _id: any;
  follower: any;
  following: any;
  isFollowActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  isFollowedByMe: boolean;
};

export class FollowService {
  async follow(
    followerId: string,
    followingId: string,
  ): Promise<IFollow | null> {
    const userToFollow = new Types.ObjectId(followingId).toString();
    if (!userToFollow) {
      throw new HttpError(404, "User to follow not found");
    }
    if (followerId == userToFollow) {
      throw new HttpError(400, "You cannot follow or unfollow yourself");
    }
    const isAlreadyFollowed = await followRepository.isFollowing(
      followerId,
      userToFollow,
    );
    if (isAlreadyFollowed) {
      throw new HttpError(400, "You already follow this user");
    }
    const newFollow = await followRepository.follow(followerId, userToFollow);
    await userRepository.increaseFollowerCount(userToFollow);
    await userRepository.increaseFollowingCount(followerId);

    return newFollow;
  }

  async unfollow(
    followerId: string,
    followingId: string,
  ): Promise<IFollow | null> {
    const userToUnfollow = new Types.ObjectId(followingId).toString();
    if (!userToUnfollow) {
      throw new HttpError(404, "User to unfollow not found");
    }
    const isAlreadyFollowed = await followRepository.isFollowing(
      followerId,
      userToUnfollow,
    );
    if (!isAlreadyFollowed) {
      throw new HttpError(400, "You do not follow this user");
    }
    const unfollow = await followRepository.unfollow(
      followerId,
      userToUnfollow,
    );
    await userRepository.decreaseFollowerCount(userToUnfollow);

    // await UserModel.findByIdAndUpdate(followingId, {
    //   $inc: { followerCount: -1 },
    // });

    await userRepository.decreaseFollowingCount(followerId);
    // await UserModel.findByIdAndUpdate(followerId, {
    //   $inc: { followingCount: -1 },
    // });

    return unfollow;
  }

  async getFollowersWithViewerFlag(
    userId: string,
    viewerId?: string,
  ): Promise<FollowRowWithFlag[]> {
    const rows = await followRepository.getFollowers(userId);

    // If no viewer (public endpoint), just return false
    if (!viewerId) {
      return rows.map((r: any) => ({
        ...(r.toObject?.() ?? r),
        isFollowedByMe: false,
      }));
    }

    // Get all ids that viewer follows ONCE
    const viewerFollowingIds =
      await followRepository.getFollowingIdsOnly(viewerId);
    const set = new Set(viewerFollowingIds.map(String));

    return rows.map((r: any) => {
      const obj = r.toObject?.() ?? r;
      const followerUserId = String(obj.follower?._id ?? obj.follower);
      return {
        ...obj,
        isFollowedByMe: set.has(followerUserId),
      };
    });
  }

  async getFollowingWithViewerFlag(
    userId: string,
    viewerId?: string,
  ): Promise<FollowRowWithFlag[]> {
    const rows = await followRepository.getFollowing(userId);

    if (!viewerId) {
      return rows.map((r: any) => ({
        ...(r.toObject?.() ?? r),
        isFollowedByMe: false,
      }));
    }

    const viewerFollowingIds =
      await followRepository.getFollowingIdsOnly(viewerId);
    const set = new Set(viewerFollowingIds.map(String));

    return rows.map((r: any) => {
      const obj = r.toObject?.() ?? r;
      const followingUserId = String(obj.following?._id ?? obj.following); // following is populated
      return {
        ...obj,
        isFollowedByMe: set.has(followingUserId),
      };
    });
  }

  async isAlreadyFollowing(followerId: string, followingId: string) {
    const isFollowing = await followRepository.isFollowing(
      followerId,
      followingId,
    );
    return isFollowing;
  }
}
