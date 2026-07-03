import { Types } from "mongoose";
import { IPost } from "../model/post.model";
import { PostRepository } from "../repository/post.repository";
import { CreatePostDTO, EditPostDTO } from "../dto/post.dto";
import { UserRepository } from "../../user/repository/user.repository";
import { FollowRepository } from "../../follow/repository/follow.repository";

const userRepository = new UserRepository();
const postRepository = new PostRepository();
const followRepository = new FollowRepository();

export class PostService {
  async createPost(userId: string, data: CreatePostDTO): Promise<IPost> {
    const postToCreate = {
      // MongoDB expects ObjectId, but request/JWT gives us a string
      // So we convert userId (string from JWT/request) into MongoDB ObjectId required by the Post model
      author: new Types.ObjectId(userId), // TRUST SERVER ONLY
      postTitle: data.postTitle,
      postContent: data.postContent,
      visibility: data.visibility ?? "public",
    };

    const post = await postRepository.createPost(postToCreate);
    const postId = post._id.toString();

    await userRepository.increasePostCount(userId, postId);

    return post;
  }

  async editPost(
    userId: string,
    postId: string,
    data: EditPostDTO,
  ): Promise<IPost> {
    const post = await postRepository.getPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    // Ownership check (CRITICAL)
    if (post.author._id.toString() !== userId) {
      throw new Error("You are not allowed to edit this post");
    }

    const updatedPost = await postRepository.editPost(postId, data);
    if (!updatedPost) {
      throw new Error("Failed to update post");
    }

    return updatedPost;
  }

  async deletePost(
    userId: string,
    postId: string,
  ): Promise<{ message: string }> {
    const post = await postRepository.getPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.author._id.toString() !== userId) {
      throw new Error("You are not allowed to delete this post");
    }

    await postRepository.deletePost(postId);
    await userRepository.decreasePostCount(userId, postId);

    return { message: "Post deleted successfully" };
  }

  async getFeed(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<IPost[]> {
    const skip = (page - 1) * limit;

    return await postRepository.getPublicFeed(skip, limit);
  }

  async getFollowingFeed(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const followingIds = await followRepository.getFollowingIdsOnly(userId);

    if (followingIds.length === 0) return [];

    return await postRepository.getFollowingFeed(followingIds, skip, limit);
  }

  async getPostsByUser(userId: string): Promise<IPost[]> {
    return postRepository.getPostsByUser(userId);
  }

  async likePost(postId: string, userId: string): Promise<{ message: string }> {
    const post = await postRepository.getPostById(postId);
    if (!post) {
      throw new Error("Post Doesnt Exist");
    }
    const user = new Types.ObjectId(userId);
    if (post.likedBy.some((id) => id.equals(user))) {
      return { message: "Post already upvoted" };
    }

    await postRepository.likePost(postId, userId);

    // await PostModel.findByIdAndUpdate(postId, {
    //   $push: { likedBy: user },
    // });
    return { message: "Post Liked" };
  }

  async unlikePost(
    postId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const post = await postRepository.getPostById(postId);
    if (!post) {
      throw new Error("Post Doesnt Exist");
    }
    const user = new Types.ObjectId(userId);

    const hasLiked = post.likedBy.some((id: Types.ObjectId) => id.equals(user));
    if (!hasLiked) {
      return { message: "Post was not upvoted" };
    }

    await postRepository.unlikePost(postId, userId);

    // await PostModel.findByIdAndUpdate(postId, {
    //   $pull: { likedBy: user },
    // });
    return { message: "Post Unliked" };
  }
}
