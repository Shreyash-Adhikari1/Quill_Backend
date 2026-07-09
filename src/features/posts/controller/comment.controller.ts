import { Request, Response } from "express";
import { CommentDTO } from "../dto/comment.dto";
import { CommentService } from "../service/comment.service";
import { sendSafeError } from "../../../utils/api-response";

const commentService = new CommentService();

export class CommentController {
  createComment = async (req: Request, res: Response) => {
    try {
      const commentData = CommentDTO.safeParse(req.body);

      if (!commentData.success) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid Details" });
      }

      const userId = (req as any).user.id;

      const postId = req.params.postId;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized User" });
      }

      if (!postId) {
        return res
          .status(401)
          .json({ success: false, message: "Post Not Found" });
      }
      const comment = await commentService.createComment(
        commentData.data,
        userId,
        postId as string,
      );
      return res
        .status(200)
        .json({ success: true, message: "Comment Successful", comment });
    } catch (error: any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };

  deleteComment = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { commentId } = req.params;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Uauthorized Access Denied" });
      }
      if (!commentId) {
        return res
          .status(401)
          .json({ success: false, message: "Comment Doesbnt Exist" });
      }
      const deletedComment = await commentService.deleteComment(
        userId,
        commentId as string,
      );
      if (!deletedComment) {
        return res
          .status(404)
          .json({ message: "Comment not found or not owned by user" });
      }
      return res
        .status(201)
        .json({ success: true, message: "Commented Deleted Successfully" });
    } catch (error: any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };

  likeComment = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { commentId } = req.params;

      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Uauthorized Access Denied" });
      }
      if (!commentId) {
        return res
          .status(404)
          .json({ success: false, message: "Comment not found" });
      }
      const like = await commentService.likeComment(
        commentId as string,
        userId,
      );
      return res
        .status(201)
        .json({ success: true, message: "Commented Liked" });
    } catch (error: any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };

  unlikeComment = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { commentId } = req.params;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Uauthorized Access Denied" });
      }
      if (!commentId) {
        return res
          .status(404)
          .json({ success: false, message: "Comment not found" });
      }
      const unlike = await commentService.unlikeComment(
        commentId as string,
        userId,
      );
      return res
        .status(201)
        .json({ success: true, message: "Commented Unliked" });
    } catch (error: any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };

  getCommentsForPost = async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      if (!postId) {
        return res
          .status(404)
          .json({ success: false, message: "Post Not Found" });
      }
      const comments = await commentService.getCommentByPost(postId as string);
      return res.status(200).json({
        success: true,
        message: "Comments Fetched Successfully",
        comments: comments,
      });
    } catch (error: any) {
      return sendSafeError(res, error, "Internal Server Error");
    }
  };
}
