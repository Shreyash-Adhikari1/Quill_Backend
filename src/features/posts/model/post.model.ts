// src/models/post.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IPost extends Document {
  author: mongoose.Types.ObjectId;
  postTitle: string;
  postContent: string;
  visibility: "public" | "followers" | "private";
  likeCount: number;
  likedBy: mongoose.Types.ObjectId[];
  commentCount: number;
  commentedBy: mongoose.Types.ObjectId[];
  isChallengeSubmission: boolean;
  isDeleted: boolean;
}

const PostSchema = new Schema<IPost>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Quill posts are text notes, so title/content are required and rendered as escaped text on the frontend.
    postTitle: { type: String, required: true, trim: true, maxlength: 140 },

    postContent: { type: String, required: true, trim: true, maxlength: 10000 },

    visibility: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "public",
    },

    likeCount: { type: Number, default: 0 },

    likedBy: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],

    commentCount: { type: Number, default: 0 },

    commentedBy: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],

    isChallengeSubmission: { type: Boolean, default: false },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const PostModel = mongoose.model<IPost>("Post", PostSchema);

export interface IPostComment extends Document {
  userId: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  commentText: string;
  likeCount: number;
  likedBy: mongoose.Types.ObjectId[];
}
const PostCommentSchema = new Schema<IPostComment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    commentText: { type: String, required: true, trim: true, maxLength: 2000 },
    likeCount: { type: Number, default: 0 },
    likedBy: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
  },
  { timestamps: true },
);
export const PostCommentModel = mongoose.model<IPostComment>(
  "PostComment",
  PostCommentSchema,
);
