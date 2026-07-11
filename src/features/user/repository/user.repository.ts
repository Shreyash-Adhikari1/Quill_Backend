import { Types } from "mongoose";
import { IUser, UserModel } from "../model/user.model";

export interface UserRepositoryInterface {
  getAllUsers(skip?: number, limit?: number): Promise<IUser[]>;
  getUserById(userId: string): Promise<IUser | null>;
  getPublicUserById(userId: string): Promise<IUser | null>;
  getUserByUsername(username: string): Promise<IUser | null>;
  getUserWithPassword(userId: string): Promise<IUser | null>;
  getUserWithSecrets(userId: string): Promise<IUser | null>;
  getUserByEmailWithSecrets(email: string): Promise<IUser | null>;
  getUserByEmail(email: string): Promise<IUser | null>;
  findByEmailOrUsername(email: string, username: string): Promise<IUser | null>;
  createUser(user: Partial<IUser>): Promise<IUser>;
  updateUser(
    userId: string,
    updatedData: Partial<IUser>,
  ): Promise<IUser | null>;

  deleteUser(userId: string): Promise<IUser | null>;

  // Post Ko Lagi Chahiney Functions
  increasePostCount(userId: string, postId: string): Promise<IUser | null>;
  decreasePostCount(userId: string, postId: string): Promise<IUser | null>;

  // Follow Ko Lagi Chahiney Functions
  increaseFollowerCount(userId: string): Promise<IUser | null>;
  increaseFollowingCount(userId: string): Promise<IUser | null>;

  decreaseFollowerCount(userId: string): Promise<IUser | null>;
  decreaseFollowingCount(userId: string): Promise<IUser | null>;
}

export class UserRepository implements UserRepositoryInterface {
  async getUserByEmail(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email }).exec();
  }
  async getAllUsers(skip: number = 0, limit: number = 10) {
    return UserModel.find({ role: { $ne: "admin" } })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async getUserById(userId: string) {
    return UserModel.findById(userId).exec();
    // return UserModel.findById(userId).populate("posts").exec();
  }

  async getPublicUserById(userId: string) {
    // Public/social profile reads exclude admins so privileged accounts do not appear as normal community users.
    return UserModel.findOne({ _id: userId, role: { $ne: "admin" } }).exec();
  }

  async getUserByUsername(username: string) {
    return UserModel.findOne({ username }).exec();
  }

  async findByEmailOrUsername(email: string, username: string) {
    return UserModel.findOne({ $or: [{ email }, { username }] }).exec();
  }

  async getUserWithPassword(userId: string) {
    return UserModel.findById(userId).select("+password").exec();
  }

  async getUserWithSecrets(userId: string) {
    // Explicit opt-in prevents sensitive auth material from appearing in normal user reads.
    return UserModel.findById(userId)
      .select("+password +otpSecret +pendingOtpSecret +passwordHistory +emailVerificationCode +emailVerificationExpires +resetPasswordCode +resetPasswordExpires")
      .exec();
  }

  async getUserByEmailWithSecrets(email: string) {
    // Used only for verification/reset flows that need hashed one-time codes.
    return UserModel.findOne({ email: email.toLowerCase() })
      .select("+password +otpSecret +pendingOtpSecret +passwordHistory +emailVerificationCode +emailVerificationExpires +resetPasswordCode +resetPasswordExpires")
      .exec();
  }

  async createUser(user: Partial<IUser>) {
    const newUser = new UserModel(user);
    return newUser.save();
  }

  async updateUser(userId: string, updatedData: Partial<IUser>) {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    for (const [key, value] of Object.entries(updatedData)) {
      if (value === undefined) {
        // Security cleanup: undefined values are intentional secret/OTP removals, so turn them into real $unset operations.
        $unset[key] = 1;
      } else {
        $set[key] = value;
      }
    }

    return UserModel.findByIdAndUpdate(
      userId,
      {
        ...($set && Object.keys($set).length > 0 ? { $set } : {}),
        ...($unset && Object.keys($unset).length > 0 ? { $unset } : {}),
      },
      { new: true, runValidators: true },
    ).exec();
  }

  async deleteUser(userId: string) {
    return UserModel.findByIdAndDelete(userId).exec();
  }

  async increasePostCount(
    userId: string,
    postId: string,
  ): Promise<IUser | null> {
    const user = new Types.ObjectId(userId);
    const post = new Types.ObjectId(postId);
    return await UserModel.findByIdAndUpdate(
      user,
      {
        $inc: { postCount: 1 },
        $addToSet: { posts: post },
      },
      { new: true },
    )
      .populate("posts", "media caption tags")
      .exec();
  }

  async decreasePostCount(
    userId: string,
    postId: string,
  ): Promise<IUser | null> {
    const post = new Types.ObjectId(postId);
    return await UserModel.findByIdAndUpdate(
      userId,
      {
        $inc: { postCount: -1 },
        $pull: { posts: post },
      },
      { new: true },
    );
  }

  async increaseFollowerCount(userId: string): Promise<IUser | null> {
    const userObjId = new Types.ObjectId(userId);
    return await UserModel.findByIdAndUpdate(userObjId, {
      $inc: { followerCount: 1 },
    });
  }

  async decreaseFollowerCount(userId: string): Promise<IUser | null> {
    const userObjId = new Types.ObjectId(userId);
    return await UserModel.findByIdAndUpdate(userObjId, {
      $inc: { followerCount: -1 },
    });
  }

  async increaseFollowingCount(userId: string): Promise<IUser | null> {
    const userObjId = new Types.ObjectId(userId);
    return await UserModel.findByIdAndUpdate(userObjId, {
      $inc: { followingCount: 1 },
    });
  }

  async decreaseFollowingCount(userId: string): Promise<IUser | null> {
    const userObjId = new Types.ObjectId(userId);
    return await UserModel.findByIdAndUpdate(userObjId, {
      $inc: { followingCount: -1 },
    });
  }
}
