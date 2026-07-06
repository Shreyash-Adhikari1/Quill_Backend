import { Types } from "mongoose";
import { IPostComment, PostCommentModel, PostModel } from "../model/post.model";

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
    const likedComment = await PostCommentModel.findByIdAndUpdate(
      commentId,
      { $inc: { likeCount: 1 }, $addToSet: { likedBy: userIdObj } },
      { new: true },
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
    const unlikedComment = await PostCommentModel.findByIdAndUpdate(
      commentId,
      { $inc: { likeCount: -1 }, $pull: { likedBy: userIdObj } },
      { new: true },
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
}
