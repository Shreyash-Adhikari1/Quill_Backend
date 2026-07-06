import { IPost, PostModel } from "../../posts/model/post.model";
import { IUser, UserModel } from "../../user/model/user.model";

export interface IAdminRepository {
  // Admin-User Operations
  getAllUsers(skip?: number, limit?: number): Promise<IUser[]>;
  getUserById(userId: string): Promise<IUser | null>;
  getUserByUsername(username: string): Promise<IUser | null>;
  getUserByEmail(email: string): Promise<IUser | null>;
  deleteUser(userId: string): Promise<IUser | null>;
  deleteAllUsers(): Promise<{ deletedCount: number }>; // returns how many users deleted , thats it

  // Admin-Post Operations
  getAllPosts(skip?: number, limit?: number): Promise<IPost[]>;
  getPostById(postId: string): Promise<IPost | null>;
  getPostsByUser(userId: string): Promise<IPost[]>;
  deletePost(postId: string): Promise<IPost | null>;
  deleteAllPostsByUser(userId: string): Promise<{ deletedCount: number }>; // returns how many posts deleted, thats it
}
export class AdminRepository implements IAdminRepository {
  // User
  async getAllUsers(skip: number = 0, limit: number = 10): Promise<IUser[]> {
    return UserModel.find({ role: { $ne: "admin" } })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async getUserById(userId: string): Promise<IUser | null> {
    return UserModel.findById(userId).exec();
  }
  async getUserByUsername(username: string): Promise<IUser | null> {
    return UserModel.findOne({ username }).exec();
  }
  async getUserByEmail(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email }).exec();
  }
  async deleteUser(userId: string): Promise<IUser | null> {
    return UserModel.findByIdAndDelete(userId).exec();
  }
  async deleteAllUsers(): Promise<{ deletedCount: number }> {
    return UserModel.deleteMany({ role: { $ne: "admin" } }).exec();
  }

  // Post
  async getAllPosts(skip: number = 0, limit: number = 10): Promise<IPost[]> {
    return PostModel.find().skip(skip).limit(limit).exec();
  }
  async getPostById(postId: string): Promise<IPost | null> {
    return PostModel.findById(postId).exec();
  }
  async getPostsByUser(userId: string, skip = 0, limit = 10): Promise<IPost[]> {
    return PostModel.find({ author: userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }
  async deletePost(postId: string): Promise<IPost | null> {
    return PostModel.findByIdAndDelete(postId).exec();
  }
  async deleteAllPostsByUser(
    userId: string,
  ): Promise<{ deletedCount: number }> {
    const deleted = await PostModel.deleteMany({ author: userId }).exec();
    await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: { posts: [], postCount: 0 },
      },
      { new: true },
    );
    return deleted;
  }
}
