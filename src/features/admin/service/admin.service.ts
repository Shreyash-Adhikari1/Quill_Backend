import { IPost } from "../../posts/model/post.model";
import { IUser } from "../../user/model/user.model";
import { UserRepository } from "../../user/repository/user.repository";
import { AdminRepository } from "../repository/admin.repository";

const adminRepository = new AdminRepository();
const userRepository = new UserRepository();

export class AdminService {
  // Helper Function || even Admin Doesnt get to see passwords
  private sanitizeUser(user: IUser) {
    const userObj = user.toObject();
    const { password, __v, ...safeUser } = userObj;
    return safeUser;
  }
  //   User Get Logics
  async getAllUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const users = await adminRepository.getAllUsers(skip, limit);
    return users.map((user) => this.sanitizeUser(user));
  }

  async getUserById(userId: string) {
    const user = await adminRepository.getUserById(userId);
    if (!user) throw new Error("User not found");
    return this.sanitizeUser(user);
  }

  async getUserByUsername(username: string) {
    const user = await adminRepository.getUserByUsername(username);
    if (!user) throw new Error("User not found");
    return this.sanitizeUser(user);
  }

  //User Delete logic

  async deleteUser(userId: string) {
    const user = await adminRepository.getUserById(userId);
    if (!user) throw new Error("User not found");

    await adminRepository.deleteUser(userId);
    return { message: "User deleted successfully" };
  }

  async deleteAllUsers() {
    await adminRepository.deleteAllUsers();
    return { mesage: "All Users Deleted" };
  }

  //   Post Get Logics
  async getAllPosts(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const posts = await adminRepository.getAllPosts(skip, limit);
    return posts;
  }

  async getPostsByUser(userId: string) {
    return adminRepository.getPostsByUser(userId);
  }

  async getPostById(postId: string) {
    return adminRepository.getPostById(postId);
  }

  // Post Delete Logics
  async deletePost(postId: string): Promise<{ message: string }> {
    const post = await adminRepository.getPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }
    const userId = post.author._id.toString();
    await adminRepository.deletePost(postId);
    await userRepository.decreasePostCount(userId, postId);

    return { message: "Post deleted successfully" };
  }

  async deleteAllPostsByUser(userId: string) {
    await adminRepository.deleteAllPostsByUser(userId);
    return { message: "All Posts By User Deleted" };
  }
}
