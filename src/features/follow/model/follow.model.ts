import mongoose, { Document, Schema } from "mongoose";

export interface IFollow extends Document {
  follower: mongoose.Types.ObjectId;
  following: mongoose.Types.ObjectId;
  isFollowActive: boolean;
}

const FollowSchema: Schema<IFollow> = new mongoose.Schema(
  {
    follower: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    following: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    isFollowActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });

export const FollowModel = mongoose.model<IFollow>("Follow", FollowSchema); // Ensure that There can never be two documents with the same (follower, following) pair.
