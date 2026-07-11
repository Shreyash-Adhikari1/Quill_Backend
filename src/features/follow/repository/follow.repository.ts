import { FollowModel, IFollow } from "../model/follow.model";

export interface FollowRepositoryInterface {
  follow(followerId: string, followingId: string): Promise<IFollow | null>;
  unfollow(followerId: string, followingId: string): Promise<IFollow | null>;
  getFollowers(userId: string): Promise<IFollow[]>;
  getFollowing(userId: string): Promise<IFollow[]>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  deleteFollowsForUser(userId: string): Promise<{ deletedCount: number }>;
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
      .populate({ path: "follower", select: "_id username avatar", match: { role: { $ne: "admin" } } })
      .populate({ path: "following", select: "_id username avatar", match: { role: { $ne: "admin" } } })
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
      .populate({ path: "follower", select: "_id username avatar", match: { role: { $ne: "admin" } } })
      .populate({ path: "following", select: "_id username avatar", match: { role: { $ne: "admin" } } })
      .exec();

    if (!deletedFollow) {
      throw new Error("You do not follow this user");
    }

    return deletedFollow;
  }

  // Get all users who follow this user
  async getFollowers(userId: string): Promise<IFollow[]> {
    return FollowModel.find({ following: userId, isFollowActive: true })
      .populate({ path: "follower", select: "_id username avatar", match: { role: { $ne: "admin" } } })
      .exec();
  }

  // Get all users that this user is following
  async getFollowing(userId: string): Promise<IFollow[]> {
    return FollowModel.find({ follower: userId, isFollowActive: true })
      .populate({ path: "following", select: "_id username avatar", match: { role: { $ne: "admin" } } })
      .exec();
  }
  // This method has been added purely to filter posts by following
  async getFollowingIdsOnly(userId: string): Promise<string[]> {
    const rows = await FollowModel.find({ follower: userId })
      .select("following")
      .populate({ path: "following", select: "_id", match: { role: { $ne: "admin" } } })
      .lean()
      .exec();

    return rows.filter((r: any) => r.following).map((r: any) => String(r.following._id ?? r.following));
  }

  // Check if followerId is following followingId
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const exists = await FollowModel.exists({
      follower: followerId,
      following: followingId,
    });
    return !!exists;
  }

  async deleteFollowsForUser(userId: string): Promise<{ deletedCount: number }> {
    return FollowModel.deleteMany({
      $or: [{ follower: userId }, { following: userId }],
    }).exec();
  }
}
