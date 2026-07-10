import { Types } from "mongoose";
import { CommentDTO } from "../dto/comment.dto";
import { IPostComment } from "../model/post.model";
import { PostCommentRepository } from "../repository/comment.repository";
import { PostRepository } from "../repository/post.repository";
import { FollowRepository } from "../../follow/repository/follow.repository";
import { HttpError } from "../../../errors/http-error";

const commentRepository = new PostCommentRepository();
const postRepository = new PostRepository();
const followRepository = new FollowRepository();

function authorIdOfPost(post: any) {
  return String(post?.author?._id ?? post?.author);
}

export class CommentService {
  private async assertCanAccessPost(userId: string, postId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(postId)) {
      throw new HttpError(400, "Invalid post access request");
    }

    const post = await postRepository.getPostById(postId);
    if (!post) throw new HttpError(404, "Post not found");

    const authorId = authorIdOfPost(post);
    if (authorId === userId || post.visibility === "public") return;
    if (post.visibility === "followers" && (await followRepository.isFollowing(userId, authorId))) return;

    // Access-control defense: comment APIs cannot be used to interact with private/followers-only posts by guessing IDs.
    throw new HttpError(403, "You are not allowed to access this post");
  }

  async createComment(
    data: CommentDTO,
    userId: string,
    postId: string,
  ): Promise<IPostComment | null> {
    // Avoid White Spaces by using trim
    userId = userId.trim();
    postId = postId.trim();

    if (!userId || !postId) {
      throw new HttpError(400, "UserId and PostId are required");
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpError(400, "Invalid userId");
    }

    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpError(400, "Invalid postId");
    }

    await this.assertCanAccessPost(userId, postId);

    const commentDetails = {
      commentText: data.commentText,
      userId: new Types.ObjectId(userId),
      postId: new Types.ObjectId(postId),
    };

    const comment = await commentRepository.createComment(commentDetails);

    // Increase Comment Count on post
    await postRepository.increaseCommentCount(postId, userId);
    return comment;
  }

  async deleteComment(
    userId: string,
    commentId: string,
  ): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(commentId)) {
      throw new HttpError(400, "Invalid comment delete request");
    }
    const comment = await commentRepository.getCommentById(commentId);
    if (!comment) {
      throw new HttpError(404, "Comment not found");
    }
    await this.assertCanAccessPost(userId, comment.postId.toString());

    if (comment.userId.toString() !== userId) {
      throw new HttpError(403, "You can only delete your own comments");
    }

    const postId = comment.postId;

    await commentRepository.deleteComment(commentId);

    await postRepository.decreaseCommentCount(postId.toString(), userId);

    return { message: "Comment deleted Successfully" };
  }

  async likeComment(
    commentId: string,
    userId: string,
  ): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(commentId)) {
      throw new HttpError(400, "Invalid comment like request");
    }
    const comment = await commentRepository.getCommentById(commentId);
    if (!comment) {
      throw new HttpError(404, "Comment not found");
    }
    await this.assertCanAccessPost(userId, comment.postId.toString());

    const user = new Types.ObjectId(userId);
    // Check if user already liked
    if (comment.likedBy?.some((id) => id.equals(user))) {
      throw new HttpError(409, "You have already liked this comment");
    }

    const updatedComment = await commentRepository.likeComment(commentId, userId);
    if (!updatedComment) {
      throw new HttpError(409, "You have already liked this comment");
    }

    // await PostCommentModel.findByIdAndUpdate(commentId, {
    //   $push: { likedBy: user },
    // });

    return { message: "Comment Liked" };
  }

  async unlikeComment(
    commentId: string,
    userId: string,
  ): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(commentId)) {
      throw new HttpError(400, "Invalid comment unlike request");
    }
    const comment = await commentRepository.getCommentById(commentId);
    if (!comment) {
      throw new HttpError(404, "Comment not found");
    }
    await this.assertCanAccessPost(userId, comment.postId.toString());

    const user = new Types.ObjectId(userId);

    // Check if user has liked before unliking

    const hasLiked = comment.likedBy.some((id: Types.ObjectId) =>
      id.equals(user),
    );
    if (!hasLiked) {
      throw new HttpError(409, "You have not liked this comment");
    }

    const updatedComment = await commentRepository.unlikeComment(commentId, userId);
    if (!updatedComment) {
      throw new HttpError(409, "You have not liked this comment");
    }

    // await PostCommentModel.findByIdAndUpdate(commentId, {
    //   $pull: { likedBy: user },
    // });

    return { message: "Comment Unliked" };
  }

  async getCommentByPost(postId: string, userId: string) {
    await this.assertCanAccessPost(userId, postId);
    return await commentRepository.getCommentsForPost(postId);
  }
}
