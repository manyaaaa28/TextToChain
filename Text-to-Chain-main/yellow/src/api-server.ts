import express from "express";
import { initializeBatchService, getBatchService } from "./batch-service";
import "dotenv/config";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8083;
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY environment variable is required");
  process.exit(1);
}

// Initialize the batch service
console.log("🟡 Initializing Yellow Batch Service...\n");
initializeBatchService(PRIVATE_KEY);

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Queue a transaction
app.post("/api/yellow/send", async (req, res) => {
  try {
    const { recipientAddress, amount, userPhone, token, fromAddress, senderKey } = req.body;

    if (!recipientAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing recipientAddress or amount",
      });
    }

    const batchService = getBatchService();
    const txId = await batchService.queueTransaction(
      recipientAddress,
      amount,
      userPhone || "unknown",
      "ytest.usd",
      token || "TXTC",
      fromAddress || "",
      senderKey || ""
    );

    console.log(`📥 Transaction queued: ${txId}`);

    res.json({
      success: true,
      transactionId: txId,
      message: "Transaction queued for next batch",
      estimatedProcessing: "Within 3 minutes",
    });
  } catch (error: any) {
    console.error("❌ Queue error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get service status
app.get("/api/yellow/status", (req, res) => {
  try {
    const batchService = getBatchService();
    const status = batchService.getStatus();

    res.json({
      success: true,
      ...status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get pending transactions
app.get("/api/yellow/pending", (req, res) => {
  try {
    const batchService = getBatchService();
    const pending = batchService.getPendingTransactions();

    res.json({
      success: true,
      count: pending.length,
      transactions: pending,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "yellow-batch" });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`\n🚀 Yellow Batch API Server Started`);
  console.log(`================================`);
  console.log(`Port: ${PORT}`);
  console.log(`\n📋 Available Endpoints:`);
  console.log(`  POST /api/yellow/send    - Queue transaction`);
  console.log(`  GET  /api/yellow/status  - Service status`);
  console.log(`  GET  /api/yellow/pending - Pending transactions`);
  console.log(`  GET  /health             - Health check`);
  console.log(`\n✅ Batch processing active (3-minute sessions)`);
  console.log(`================================\n`);
});
