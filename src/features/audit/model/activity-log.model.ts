import mongoose, { Document, Schema } from "mongoose";

export interface IActivityLog extends Document {
  userId?: mongoose.Types.ObjectId;
  action: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true, index: true },
    ip: { type: String },
    userAgent: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const ActivityLogModel = mongoose.model<IActivityLog>(
  "ActivityLog",
  ActivityLogSchema,
);
