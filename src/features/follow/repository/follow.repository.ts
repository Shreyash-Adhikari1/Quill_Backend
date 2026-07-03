import { FollowModel, IFollow } from "../model/follow.model";

export interface FollowRepositoryInterface {
  follow(followerId: string, followingId: string): Promise<IFollow | null>;
  unfollow(followerId: string, followingId: string): Promise<IFollow | null>;
  getFollowers(userId: string): Promise<IFollow[]>;
  getFollowing(userId: string): Promise<IFollow[]>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
}

export class FollowRepository implements FollowRepositoryInterface {
  // Create a follow document
  async follow(
    followerId: string,
    followingId: string,
  ): Promise<IFollow | null> {
    const newFollow = new FollowModel({
      follower: followerId,
      following: followingId,
    });
    await newFollow.save(); // saves to DB

    return FollowModel.findById(newFollow._id)
      .populate("follower", "_id username avatar")
      .populate("following", "_id username avatar")
      .exec() as Promise<IFollow>;
  }

  // Hard-delete / unfollow
  async unfollow(
    followerId: string,
    followingId: string,
  ): Promise<IFollow | null> {
    // Find and delete the follow document
    const deletedFollow = await FollowModel.findOneAndDelete({
      follower: followerId,
      following: followingId,
    })
      .populate("follower", "_id username avatar")
      .populate("following", "_id username avatar")
      .exec();

    if (!deletedFollow) {
      throw new Error("You do not follow this user");
    }

    return deletedFollow;
  }

  // Get all users who follow this user
  async getFollowers(userId: string): Promise<IFollow[]> {
    return FollowModel.find({ following: userId, isFollowActive: true })
      .populate("follower", "_id username avatar")
      .exec();
  }

  // Get all users that this user is following
  async getFollowing(userId: string): Promise<IFollow[]> {
    return FollowModel.find({ follower: userId, isFollowActive: true })
      .populate("following", "_id username avatar")
      .exec();
  }
  // This method has been added purely to filter posts by following
  async getFollowingIdsOnly(userId: string): Promise<string[]> {
    const rows = await FollowModel.find({ follower: userId })
      .select("following")
      .lean()
      .exec();

    return rows.map((r: any) => String(r.following));
  }

  // Check if followerId is following followingId
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const exists = await FollowModel.exists({
      follower: followerId,
      following: followingId,
    });
    return !!exists;
  }
}
