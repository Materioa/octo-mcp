import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from client/ for local dev; on Vercel env vars are injected automatically
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.VERCEL !== "1") {
  dotenv.config({ path: path.join(__dirname, "../client/.env") });
}
// Also try root .env as fallback (contains MONGODB_URI in some setups)
dotenv.config({ path: path.join(__dirname, "../.env") });

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectDB() {
  // Already connected
  if (mongoose.connection.readyState === 1) return;
  // Connection in progress — reuse the same promise (prevents parallel connect calls in serverless)
  if (connectionPromise) {
    await connectionPromise;
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const err = new Error("MONGODB_URI is not defined in the environment.");
    console.error(err.message);
    throw err;
  }

  try {
    connectionPromise = mongoose.connect(uri, {
      dbName: "materio_chat",
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: true,
    });
    await connectionPromise;
    console.log("✅ Connected to MongoDB.");
  } catch (err) {
    connectionPromise = null;          // Allow retry on next invocation
    console.error("❌ Failed to connect to MongoDB:", err);
    throw err;                         // Surface the error to callers
  }
}

const ConversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  shareId: { type: String, index: true, sparse: true },
  title: { type: String, default: "New Chat" },
  userId: { type: String, index: true },
  anonymousId: { type: String, index: true },
  authorName: { type: String },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  messageCount: { type: Number, default: 0 },
  visibility: { type: String, enum: ["private", "public"], default: "private" },
});

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  conversationId: { type: String, required: true, index: true },
  userId: { type: String, index: true },
  anonymousId: { type: String, index: true },
  role: { type: String, required: true },
  content: { type: String, default: "" },
  timestamp: { type: Number, default: Date.now },
  isStreaming: { type: Boolean, default: false },
  toolCalls: { type: mongoose.Schema.Types.Mixed, default: [] },
  attachments: { type: mongoose.Schema.Types.Mixed, default: [] },
  error: { type: String },
  result: { type: String },
  rating: { type: String, enum: ["like", "dislike", null], default: null },
  modelUsed: { type: String },
  parentId: { type: String, index: true },
});

export const Conversation = mongoose.model("Conversation", ConversationSchema);
export const Message = mongoose.model("Message", MessageSchema);
