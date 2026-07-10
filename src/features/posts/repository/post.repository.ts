import { Types } from "mongoose";
import { IPost, PostModel } from "../model/post.model";
import { UserModel } from "../../user/model/user.model";

export interface PostRepositoryInterface {
  getAllPosts(skip?: number, limit?: number): Promise<IPost[]>;
  getPostById(postId: string): Promise<IPost | null>;
  getPostsByUser(userId: string, viewerId?: string): Promise<IPost[]>;
  getPostIdsByUser(userId: string): Promise<Types.ObjectId[]>;
  createPost(post: Partial<IPost>): Promise<IPost>;
  editPost(postId: string, updatedData: Partial<IPost>): Promise<IPost | null>;
  deletePost(postId: string): Promise<IPost | null>;
  deletePostsByUser(userId: string): Promise<{ deletedCount: number }>;
  removeLikesByUser(userId: string): Promise<void>;
  decreaseCommentCounts(userId: string, commentCounts: Array<{ postId: Types.ObjectId; count: number }>): Promise<void>;

  likePost(postId: string, userId: string): Promise<IPost | null>;
  unlikePost(postId: string, userId: string): Promise<IPost | null>;

  increaseCommentCount(postId: string, userId: string): Promise<IPost | null>;
  decreaseCommentCount(postId: string, userId: string): Promise<IPost | null>;

  postCreateForSubmission(postId: string): Promise<IPost | null>;
}

export class PostRepository implements PostRepositoryInterface {
  private async nonAdminAuthorIds(authorIds?: string[]) {
    // Public feeds must not expose admin accounts as ordinary authors.
    const filter: Record<string, unknown> = authorIds?.length
      ? { _id: { $in: authorIds }, role: { $ne: "admin" } }
      : { role: { $ne: "admin" } };
    const users = await UserModel.find(filter).select("_id").lean().exec();
    return users.map((user) => user._id);
  }

  async getAllPosts(skip = 0, limit = 10): Promise<IPost[]> {
    return PostModel.find({ isDeleted: false })
      .skip(skip)
      .limit(limit)
      .sort({ likeCount: -1, createdAt: -1 })
      .exec();
  }

  async getPublicFeed(skip = 0, limit = 10): Promise<IPost[]> {
    const nonAdminAuthorIds = await this.nonAdminAuthorIds();
    return PostModel.find({
      isDeleted: false,
      visibility: "public",
      author: { $in: nonAdminAuthorIds },
    })
      .sort({ likeCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "username fullName avatarUrl")
      .exec();
  }

  async getFollowingFeed(authorIds: string[], skip = 0, limit = 10) {
    const nonAdminAuthorIds = await this.nonAdminAuthorIds(authorIds);
    if (nonAdminAuthorIds.length === 0) return [];

    return PostModel.find({
      author: { $in: nonAdminAuthorIds },
      isDeleted: false,
      // Following feed may show public and followers-only posts from followed users, but never private notes.
      visibility: { $in: ["public", "followers"] },
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

  async getPostsByUser(userId: string, viewerId?: string, skip = 0, limit = 10): Promise<IPost[]> {
    const [nonAdminAuthorId] = await this.nonAdminAuthorIds([userId]);
    if (!nonAdminAuthorId) return [];

    const visibilityFilter: Record<string, unknown> =
      viewerId && viewerId === userId
        ? {}
        : { visibility: "public" };

    return PostModel.find({ author: userId, isDeleted: false, ...visibilityFilter })
      .sort({ createdAt: -1 })
      .populate("author", "username fullName avatarUrl")
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async getPostIdsByUser(userId: string): Promise<Types.ObjectId[]> {
    const posts = await PostModel.find({ author: userId }).select("_id").lean().exec();
    return posts.map((post) => post._id);
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

  async deletePostsByUser(userId: string): Promise<{ deletedCount: number }> {
    return PostModel.deleteMany({ author: userId }).exec();
  }

  async removeLikesByUser(userId: string): Promise<void> {
    const userIdObj = new Types.ObjectId(userId);
    await PostModel.updateMany(
      { likedBy: userIdObj },
      { $pull: { likedBy: userIdObj }, $inc: { likeCount: -1 } },
    ).exec();
  }

  async decreaseCommentCounts(userId: string, commentCounts: Array<{ postId: Types.ObjectId; count: number }>): Promise<void> {
    const userIdObj = new Types.ObjectId(userId);
    await Promise.all(
      commentCounts.map(({ postId, count }) =>
        PostModel.findByIdAndUpdate(
          postId,
          {
            $inc: { commentCount: -count },
            $pull: { commentedBy: userIdObj },
          },
        ).exec(),
      ),
    );
  }

  async likePost(postId: string, userId: string): Promise<IPost | null> {
    const userIdObj = new Types.ObjectId(userId);
    const likedPost = await PostModel.findOneAndUpdate(
      {
        _id: postId,
        // Race-condition defense: the counter changes only if the array will change too.
        likedBy: { $ne: userIdObj },
      },
      { $inc: { likeCount: 1 }, $addToSet: { likedBy: userIdObj } }, // ensures same user cannot be added twice },
      { new: true },
    )
      .populate("author", "username fullName avatarUrl")
      .exec();

    return likedPost;
  }
  async unlikePost(postId: string, userId: string): Promise<IPost | null> {
    const userIdObj = new Types.ObjectId(userId);
    const unlikedPost = await PostModel.findOneAndUpdate(
      {
        _id: postId,
        // Race-condition defense: unlike cannot drive likeCount below the actual likedBy state.
        likedBy: userIdObj,
      },
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
