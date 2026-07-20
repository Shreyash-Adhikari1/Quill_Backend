import { Request, Response } from "express";
import { CreatePostDTO, EditPostDTO } from "../dto/post.dto";
import { PostService } from "../service/post.service";
import { sendSafeError } from "../../../utils/api-response";

const postService = new PostService();

export class PostController {
  createPost = async (req: Request, res: Response) => {
    try {
      const postDetailsParsed = CreatePostDTO.safeParse(req.body);
      if (!postDetailsParsed.success) {
        return res
          .status(400)
          .json({ success: false, message: "Create Post Failed" });
      }
      const userId = (req as any).user.id; //userId is taken from jwt and is not given by the user/client
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Unauthorized || Author unauthorized",
        });
      }
      const post = await postService.createPost(userId, postDetailsParsed.data);

      return res
        .status(200)
        .json({ success: true, message: "Post Created Successfully!", post });
    } catch (error: any) {
      return sendSafeError(res, error, "Create post Failed");
    }
  };

  editPost = async (req: Request, res: Response) => {
    try {
      const editDetailsParsed = EditPostDTO.safeParse(req.body);
      if (!editDetailsParsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid Edit Data",
          errors: editDetailsParsed.error.format(),
        });
      }
      const userId = (req as any).user.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized access denied" });
      }
      const { postId } = req.params;
      if (!postId) {
        return res
          .status(400)
          .json({ success: false, message: "Post ID is required" });
      }

      const updatedPost = await postService.editPost(
        userId,
        postId as string,
        editDetailsParsed.data,
      );

      return res.status(200).json({
        success: true,
        message: "Post Edited Succesfully",
        post: updatedPost,
      });
    } catch (error: any) {
      return sendSafeError(res, error, "Edit Post Failed");
    }
  };

  deletePost = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized access denied" });
      }
      const { postId } = req.params;
      if (!postId) {
        return res
          .status(400)
          .json({ success: false, message: "Post ID is required" });
      }

      const deletedPost = await postService.deletePost(
        userId,
        postId as string,
      );

      if (!deletedPost) {
        return res.status(404).json({
          success: false,
          message: "Post not found or not owned by user",
        });
      }
      return res
        .status(200)
        .json({ success: true, message: "Post Deleted Successfully" });
    } catch (error: any) {
      return sendSafeError(res, error, "Post Delete Failed");
    }
  };

  getFeed = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized access denied" });
      }
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 10);
      const posts = await postService.getFeed(userId, page, limit);
      return res
        .status(200)
        .json({ success: true, message: "Posts fetched Successfully", posts });
    } catch (error: any) {
      return sendSafeError(res, error, "Fetching Posts Failed");
    }
  };

  getFollowingFeed = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });

      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 10);

      const posts = await postService.getFollowingFeed(userId, page, limit);

      return res.status(200).json({
        success: true,
        message: "Following Feed Fetched Successfully",
        posts,
      });
    } catch (error: any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };

  getMyPosts = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      const posts = await postService.getPostsByUser(userId, userId);

      return res.status(200).json({
        success: true,
        message: "User posts fetched successfully",
        posts,
      });
    } catch (error: any) {
      return sendSafeError(res, error, "Failed to fetch user posts");
    }
  };

  getPostsByUser = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const viewerId = (req as any).user.id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      const posts = await postService.getPostsByUser(userId as string, viewerId);

      return res.status(200).json({
        success: true,
        message: "User posts fetched successfully",
        posts,
      });
    } catch (error: any) {
      return sendSafeError(res, error, "Failed to fetch user posts");
    }
  };

  likePost = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { postId } = req.params;

      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Uauthorized Access Denied" });
      }
      if (!postId) {
        return res
          .status(404)
          .json({ success: false, message: "Post not found" });
      }
      const like = await postService.likePost(postId as string, userId);
      if (like.message === "Post already upvoted") {
        return res.status(409).json({ success: false, message: like.message });
      }

      return res.status(201).json({ success: true, message: like.message });
    } catch (error: any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };

  unlikePost = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { postId } = req.params;

      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Uauthorized Access Denied" });
      }
      if (!postId) {
        return res
          .status(404)
          .json({ success: false, message: "Post not found" });
      }
      const like = await postService.unlikePost(postId as string, userId);
      if (like.message === "Post was not upvoted") {
        return res.status(409).json({ success: false, message: like.message });
      }

      return res.status(201).json({ success: true, message: like.message });
    } catch (error: any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };
}
