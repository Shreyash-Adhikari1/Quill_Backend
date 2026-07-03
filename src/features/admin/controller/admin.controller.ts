import { Request, Response } from "express";
import { AdminService } from "../service/admin.service";
import { success } from "zod";
import { AdminRepository } from "../repository/admin.repository";
import { UserService } from "../../user/service/user.service";
import { PostService } from "../../posts/service/post.service";
import { EditUserDTO } from "../../user/dto/user.dto";
import { getAuditLogs } from "../../audit/service/audit.service";

const adminService = new AdminService();
const userService = new UserService();
const postService = new PostService();
export class AdminController {
  // User Operations
  getAllusers = async (req: Request, res: Response) => {
    try {
      const users = await adminService.getAllUsers();
      return res.status(200).json({
        success: true,
        message: "Users Fetched Successfully",
        users: users,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getUserById = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "user not found",
        });
      }
      const user = await adminService.getUserById(userId as string);
      return res.status(200).json({
        success: true,
        message: "user fetched successfully",
        user: user,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getUserByusername = async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      if (!username) {
        return res.status(400).json({
          success: false,
          message: "Username not passed",
        });
      }
      const user = await adminService.getUserByUsername(username as string);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "A user of this username doesnt exist",
        });
      }
      return res
        .status(200)
        .json({ success: true, message: "User Found", user: user });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  editUser = async (req: Request, res: Response) => {
    try {
      const editDetailsParsed = EditUserDTO.safeParse(req.body);

      if (!editDetailsParsed.success) {
        return res.status(400).json({
          message: "Invalid input",
          errors: editDetailsParsed.error.format(),
        });
      }
      const { userId } = req.params;
      // if (!req.file) {
      //   return res.status(400).json({ message: "No file uploaded" });
      // }
      // Extract filename from multer
      const avatarFileName = req.file?.filename;

      const updatedUser = await userService.updateUser(userId as string, {
        ...editDetailsParsed.data,
        avatarUrl: avatarFileName,
      });
      return res.status(200).json({
        success: true,
        message: "User updated successfully",
        user: updatedUser,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getAuditLogs = async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 50);
      const action = typeof req.query.action === "string" ? req.query.action : undefined;
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;

      const result = await getAuditLogs({ page, limit, action, userId });
      return res.status(200).json({
        success: true,
        message: "Audit logs fetched successfully",
        ...result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  exportAuditLogs = async (req: Request, res: Response) => {
    try {
      const action = typeof req.query.action === "string" ? req.query.action : undefined;
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const result = await getAuditLogs({ page: 1, limit: 500, action, userId });

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="quill-audit-logs-${Date.now()}.json"`);
      return res.status(200).json({
        exportedAt: new Date().toISOString(),
        count: result.logs.length,
        logs: result.logs,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  deleteUser = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(404).json({
          success: false,
          message: "user not found",
        });
      }
      await adminService.deleteUser(userId as string);
      return res
        .status(200)
        .json({ success: true, message: "User Deleted", user: userId });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  deleteAllUsers = async (req: Request, res: Response) => {
    try {
      await adminService.deleteAllUsers();
      return res
        .status(200)
        .json({ success: true, message: "All users deleted" });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  // Post Operations
  getAllPosts = async (req: Request, res: Response) => {
    try {
      const posts = await adminService.getAllPosts();
      return res.status(200).json({
        success: true,
        message: "Posts Fetched Successfully",
        posts: posts,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getPostByUser = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res
          .status(404)
          .json({ success: false, message: "UserId not passed" });
      }
      const userPosts = await adminService.getPostsByUser(userId as string);
      if (!userPosts) {
        return res
          .status(404)
          .json({ success: false, message: "User has no posts" });
      }
      return res.status(200).json({
        success: true,
        message: "Posts Fetched Successfully",
        posts: userPosts,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  getPostById = async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      if (!postId) {
        return res
          .status(404)
          .json({ success: false, message: "postId not passed" });
      }
      const post = await adminService.getPostById(postId as string);
      return res.status(200).json({
        success: true,
        message: "Post Fetched Successfully",
        post: post,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  deletePost = async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      if (!postId) {
        return res
          .status(404)
          .json({ success: false, message: "postId not passed" });
      }
      await adminService.deletePost(postId as string);
      return res.status(200).json({
        success: true,
        message: "Post Deleted Successfully",
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };

  deleteAllPostsByUser = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res
          .status(404)
          .json({ success: false, message: "UserId not passed" });
      }
      await adminService.deleteAllPostsByUser(userId as string);
      return res.status(200).json({
        success: true,
        message: "All Posts by the user deleted",
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };
}
