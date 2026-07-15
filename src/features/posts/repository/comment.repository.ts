import { Types } from "mongoose";
import { IPostComment, PostCommentModel } from "../model/post.model";

export interface ICommentRepository {
  createComment(comment: Partial<IPostComment>): Promise<IPostComment | null>;

  deleteComment(commentId: string): Promise<IPostComment | null>;

  likeComment(commentId: string, userId: string): Promise<IPostComment | null>;

  unlikeComment(
    commentId: string,
    userId: string,
  ): Promise<IPostComment | null>;

  getCommentByUser(userId: string): Promise<IPostComment[]>;

  getCommentById(commentId: string): Promise<IPostComment | null>;

  getCommentsForPost(postId: string): Promise<IPostComment[]>;
  getCommentCountsByUser(userId: string): Promise<Array<{ postId: Types.ObjectId; count: number }>>;
  deleteCommentsByUser(userId: string): Promise<{ deletedCount: number }>;
  deleteCommentsByPostIds(postIds: Types.ObjectId[]): Promise<{ deletedCount: number }>;
  removeLikesByUser(userId: string): Promise<void>;
}

export class PostCommentRepository implements ICommentRepository {
  async createComment(
    comment: Partial<IPostComment>,
  ): Promise<IPostComment | null> {
    const newComment = new PostCommentModel(comment);
    await newComment.save();

    return PostCommentModel.findById(newComment._id)
      .populate("userId", "username avatar")
      .exec() as Promise<IPostComment>;
  }

  async deleteComment(commentId: string): Promise<IPostComment | null> {
    return PostCommentModel.findOneAndDelete({ _id: commentId }).exec();
  }

  async likeComment(
    commentId: string,
    userId: string,
  ): Promise<IPostComment | null> {
    const userIdObj = new Types.ObjectId(userId);
    const likedComment = await PostCommentModel.findOneAndUpdate(
      {
        _id: commentId,
        // Race-condition defense: increment only when this user is not already in likedBy.
        likedBy: { $ne: userIdObj },
      },
      { $inc: { likeCount: 1 }, $addToSet: { likedBy: userIdObj } },
      { returnDocument: "after" },
    )
      .populate("userId", "username avatar")
      .exec();

    return likedComment;
  }

  async unlikeComment(
    commentId: string,
    userId: string,
  ): Promise<IPostComment | null> {
    const userIdObj = new Types.ObjectId(userId);
    const unlikedComment = await PostCommentModel.findOneAndUpdate(
      {
        _id: commentId,
        // Race-condition defense: decrement only when this user actually has a like to remove.
        likedBy: userIdObj,
      },
      { $inc: { likeCount: -1 }, $pull: { likedBy: userIdObj } },
      { returnDocument: "after" },
    )
      .populate("userId", "username")
      .exec();

    return unlikedComment;
  }

  getCommentsForPost(
    postId: string,
    skip: number = 0,
    limit: number = 10,
  ): Promise<IPostComment[]> {
    return PostCommentModel.find({ postId })
      .sort({ likeCount: -1, createdAt: -1 })
      .populate("userId", "username avatar")
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }
  async getCommentByUser(userId: string): Promise<IPostComment[]> {
    return PostCommentModel.find({ userId: userId }).exec();
  }

  async getCommentById(commentId: string): Promise<IPostComment | null> {
    return PostCommentModel.findOne({ _id: commentId }).exec();
  }

  async getCommentCountsByUser(userId: string): Promise<Array<{ postId: Types.ObjectId; count: number }>> {
    const rows = await PostCommentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { userId: new Types.ObjectId(userId) } },
      { $group: { _id: "$postId", count: { $sum: 1 } } },
    ]).exec();

    return rows.map((row) => ({ postId: row._id, count: row.count }));
  }

  async deleteCommentsByUser(userId: string): Promise<{ deletedCount: number }> {
    return PostCommentModel.deleteMany({ userId }).exec();
  }

  async deleteCommentsByPostIds(postIds: Types.ObjectId[]): Promise<{ deletedCount: number }> {
    if (postIds.length === 0) return { deletedCount: 0 };
    return PostCommentModel.deleteMany({ postId: { $in: postIds } }).exec();
  }

  async removeLikesByUser(userId: string): Promise<void> {
    const userIdObj = new Types.ObjectId(userId);
    await PostCommentModel.updateMany(
      { likedBy: userIdObj },
      { $pull: { likedBy: userIdObj }, $inc: { likeCount: -1 } },
    ).exec();
  }
}
