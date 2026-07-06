import { Types } from "mongoose";
import { IPost, PostModel } from "../model/post.model";
import { UserModel } from "../../user/model/user.model";

export interface PostRepositoryInterface {
  getAllPosts(skip?: number, limit?: number): Promise<IPost[]>;
  getPostById(postId: string): Promise<IPost | null>;
  getPostsByUser(userId: string): Promise<IPost[]>;
  createPost(post: Partial<IPost>): Promise<IPost>;
  editPost(postId: string, updatedData: Partial<IPost>): Promise<IPost | null>;
  deletePost(postId: string): Promise<IPost | null>;

  likePost(postId: string, userId: string): Promise<IPost | null>;
  unlikePost(postId: string, userId: string): Promise<IPost | null>;

  increaseCommentCount(postId: string, userId: string): Promise<IPost | null>;
  decreaseCommentCount(postId: string, userId: string): Promise<IPost | null>;

  postCreateForSubmission(postId: string): Promise<IPost | null>;
}

export class PostRepository implements PostRepositoryInterface {
  async getAllPosts(skip = 0, limit = 10): Promise<IPost[]> {
    return PostModel.find({ isDeleted: false })
      .skip(skip)
      .limit(limit)
      .sort({ likeCount: -1, createdAt: -1 })
      .exec();
  }

  async getPublicFeed(skip = 0, limit = 10): Promise<IPost[]> {
    return PostModel.find({
      isDeleted: false,
      visibility: "public",
    })
      .sort({ likeCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "username fullName avatarUrl")
      .exec();
  }

  async getFollowingFeed(authorIds: string[], skip = 0, limit = 10) {
    return PostModel.find({
      author: { $in: authorIds },
    })
      .sort({ likeCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "_id username fullName avatarUrl")
      .exec();
  }

  async getPostById(postId: string): Promise<IPost | null> {
    return PostModel.findOne({ _id: postId, isDeleted: false })
      .populate("author", "username fullName avatarUrl")
      .exec();
  }

  async getPostsByUser(userId: string, skip = 0, limit = 10): Promise<IPost[]> {
    return PostModel.find({ author: userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate("author", "username fullName avatarUrl")
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async createPost(post: Partial<IPost>): Promise<IPost> {
    const newPost = new PostModel(post);
    return newPost.save();
  }

  async editPost(
    postId: string,
    updatedData: Partial<IPost>,
  ): Promise<IPost | null> {
    return PostModel.findByIdAndUpdate(postId, updatedData, {
      new: true,
    }).exec();
  }

  async deletePost(postId: string): Promise<IPost | null> {
    return PostModel.findByIdAndDelete(postId).exec();
  }

  async likePost(postId: string, userId: string): Promise<IPost | null> {
    const userIdObj = new Types.ObjectId(userId);
    const likedPost = await PostModel.findByIdAndUpdate(
      postId,
      { $inc: { likeCount: 1 }, $addToSet: { likedBy: userIdObj } }, // ensures same user cannot be added twice },
      { new: true },
    )
      .populate("author", "username fullName avatarUrl")
      .exec();

    return likedPost;
  }
  async unlikePost(postId: string, userId: string): Promise<IPost | null> {
    const userIdObj = new Types.ObjectId(userId);
    const unlikedPost = await PostModel.findByIdAndUpdate(
      postId,
      { $inc: { likeCount: -1 }, $pull: { likedBy: userIdObj } },
      { new: true },
    )
      .populate("author", "username fullName avatarUrl")
      .exec();

    return unlikedPost;
  }

  async increaseCommentCount(
    postId: string,
    userId: string,
  ): Promise<IPost | null> {
    const userObjId = new Types.ObjectId(userId);
    return await PostModel.findByIdAndUpdate(
      postId,
      {
        $inc: { commentCount: 1 },
        $addToSet: { commentedBy: userObjId },
      },
      { new: true },
    );
  }

  async decreaseCommentCount(
    postId: string,
    userId: string,
  ): Promise<IPost | null> {
    const userObjId = new Types.ObjectId(userId);
    return await PostModel.findByIdAndUpdate(
      postId,
      {
        $inc: { commentCount: -1 },
        $pull: { commentedBy: userObjId },
      },
      { new: true },
    );
  }

  async postCreateForSubmission(postId: string): Promise<IPost | null> {
    return await PostModel.findByIdAndUpdate(
      postId,
      { $set: { isChallengeSubmission: true } },
      { new: true },
    );
  }
}
