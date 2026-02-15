import { initializeBatchService } from "./batch-service";
import "dotenv/config";

// Initialize and start the batch service
console.log("🟡 Starting Yellow Batch Service...\n");

try {
  const batchService = initializeBatchService(
    process.env.PRIVATE_KEY as `0x${string}`
  );
  
  console.log("✅ Batch service initialized successfully!");
  console.log("📊 Service is now monitoring for transactions...");
  console.log("🔄 Batches will process every 3 minutes when transactions are queued\n");
  
  // Keep the process running
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down batch service...");
    process.exit(0);
  });
  
} catch (error) {
  console.error("❌ Failed to start batch service:", error);
  process.exit(1);
}
