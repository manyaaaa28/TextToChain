import {
  createTransferMessage,
  createGetConfigMessage,
  createECDSAMessageSigner,
  createEIP712AuthMessageSigner,
  createAuthVerifyMessageFromChallenge,
  createAuthRequestMessage,
  createGetLedgerBalancesMessage,
} from "@erc7824/nitrolite";
import { createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import WebSocket from "ws";
import "dotenv/config";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLEARNODE_WS_URL = "wss://clearnet-sandbox.yellow.com/ws";
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:3000";

// ============================================================================
// TYPES
// ============================================================================

interface PendingTransaction {
  id: string;
  recipientAddress: string;
  amount: string;
  asset: string;
  userPhone: string;
  token: string;
  fromAddress: string;
  senderKey: string;
  timestamp: number;
  status: "pending" | "processing" | "completed" | "failed";
  yellowTxId?: number;
}

// ============================================================================
// YELLOW BATCH SERVICE — Nitrolite SDK (Unified Balance + Transfers)
//
// Flow per batch:
//   1. Connect to clearnode WebSocket
//   2. Auth (EIP-712 challenge-response)
//   3. Send N instant off-chain transfers via createTransferMessage
//   4. Disconnect
//
// No on-chain channel creation needed — uses Yellow's unified balance
// (funded via sandbox faucet). Transfers are instant, zero gas.
// ============================================================================

export class YellowBatchService {
  private pendingTransactions: PendingTransaction[] = [];
  private completedTransactions: PendingTransaction[] = [];
  private isProcessing: boolean = false;
  private batchCount: number = 0;

  private privateKey: `0x${string}`;
  private account: any;
  private walletClient: any;
  private ledgerBalance: string = "0";

  constructor(privateKey: `0x${string}`) {
    this.privateKey = privateKey;
    const RPC_URL = process.env.ALCHEMY_RPC_URL || "https://1rpc.io/sepolia";

    this.account = privateKeyToAccount(privateKey);
    console.log("🟡 Yellow Batch Service (Nitrolite SDK)");
    console.log("   Wallet:", this.account.address);

    this.walletClient = createWalletClient({
      chain: sepolia,
      transport: http(RPC_URL),
      account: this.account,
    });

    this.startBatchLoop();
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  public queueTransaction(
    recipientAddress: string,
    amount: string,
    userPhone: string,
    asset: string = "ytest.usd",
    token: string = "TXTC",
    fromAddress: string = "",
    senderKey: string = ""
  ): string {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.pendingTransactions.push({
      id: txId,
      recipientAddress,
      amount,
      asset,
      userPhone,
      token,
      fromAddress,
      senderKey,
      timestamp: Date.now(),
      status: "pending",
    });
    console.log(`📥 Queued ${txId}: ${amount} ${asset} → ${recipientAddress} (queue: ${this.pendingTransactions.length})`);
    return txId;
  }

  // ========================================================================
  // BATCH LOOP
  // ========================================================================

  private startBatchLoop() {
    const SESSION_MS = 3 * 60 * 1000; // 3 minutes
    console.log(`🔄 Session cycle: every ${SESSION_MS / 1000}s — collecting transactions...`);

    setInterval(() => {
      try {
        if (this.isProcessing) return;
        const pending = this.pendingTransactions.filter((tx) => tx.status === "pending");
        if (pending.length > 0) {
          console.log(`\n� Session window closed — ${pending.length} transactions to process`);
          this.processViaNitrolite(pending).catch((err) => {
            console.error("❌ Yellow transfer failed:", err?.message);
            console.log("⚠️  Falling back to direct on-chain settlement...");
            this.fallbackOnChain(pending).catch((e) => {
              console.error("❌ Fallback also failed:", e?.message);
              this.isProcessing = false;
            });
          });
        } else {
          console.log(`💤 Session window closed — no transactions (${new Date().toLocaleTimeString()})`);
        }
      } catch (err: any) {
        console.error("❌ Loop error:", err?.message);
      }
    }, SESSION_MS);
  }

  // ========================================================================
  // NITROLITE SDK: Auth → Transfer (instant, off-chain, zero gas)
  // ========================================================================

  private processViaNitrolite(transactions: PendingTransaction[]): Promise<void> {
    this.isProcessing = true;
    this.batchCount++;
    for (const tx of transactions) tx.status = "processing";

    console.log(`\n========== YELLOW BATCH #${this.batchCount} ==========`);
    console.log(`Transactions: ${transactions.length}`);

    // Fresh session key per batch
    const sessionPrivateKey = generatePrivateKey();
    const sessionAccount = privateKeyToAccount(sessionPrivateKey);
    const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);
    console.log(`🔐 Session: ${sessionAccount.address}`);

    const batchNum = this.batchCount;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(CLEARNODE_WS_URL);
      let authed = false;
      let transfersSent = 0;
      let transfersConfirmed = 0;

      const timeout = setTimeout(() => {
        console.error("❌ Batch timeout (2 min)");
        for (const tx of transactions) {
          if (tx.status === "processing") tx.status = "pending";
        }
        this.isProcessing = false;
        try { ws.close(); } catch (_) {}
        reject(new Error("Batch timeout"));
      }, 2 * 60 * 1000);

      const finish = (success: boolean) => {
        clearTimeout(timeout);
        this.pendingTransactions = this.pendingTransactions.filter(
          (t) => t.status === "pending"
        );
        this.isProcessing = false;

        const completed = transactions.filter((t) => t.status === "completed").length;
        const failed = transactions.filter((t) => t.status === "failed").length;

        console.log(`\n✅ Yellow Batch #${batchNum} done!`);
        console.log(`   Completed: ${completed} | Failed: ${failed}`);
        console.log(`   Mode: Off-chain (instant, zero gas)`);
        console.log(`====================================\n`);

        try { ws.close(); } catch (_) {}
        if (success) resolve(); else reject(new Error("Some transfers failed"));
      };

      const authParams = {
        session_key: sessionAccount.address,
        allowances: [{ asset: "ytest.usd", amount: "1000000000" }],
        expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
        scope: "console",
      };

      ws.on("open", async () => {
        try {
          console.log("🔗 Connected to Yellow Network");
          const authMsg = await createAuthRequestMessage({
            address: this.account.address,
            application: "TextChain Batch",
            ...authParams,
          });
          ws.send(authMsg);
        } catch (err) {
          clearTimeout(timeout);
          this.isProcessing = false;
          reject(err);
        }
      });

      ws.on("message", async (data: any) => {
        try {
          const resp = JSON.parse(data.toString());

          if (resp.error) {
            console.error("❌ Yellow error:", JSON.stringify(resp.error));
            // Check if it's a transfer error
            const errMsg = typeof resp.error === "string" ? resp.error : resp.error?.message || JSON.stringify(resp.error);
            if (errMsg.includes("insufficient")) {
              console.error("   Insufficient ytest.usd balance on Yellow");
            }
            clearTimeout(timeout);
            this.isProcessing = false;
            for (const tx of transactions) {
              if (tx.status === "processing") tx.status = "pending";
            }
            reject(new Error(errMsg));
            ws.close();
            return;
          }

          const method = resp.res?.[1];

          // Auth challenge → verify
          if (method === "auth_challenge" && !authed) {
            console.log("🔑 Authenticating...");
            const challenge = resp.res[2].challenge_message;
            const signer = createEIP712AuthMessageSigner(
              this.walletClient, authParams, { name: "TextChain Batch" }
            );
            const verifyMsg = await createAuthVerifyMessageFromChallenge(signer, challenge);
            ws.send(verifyMsg);
          }

          // Auth verified → send all transfers
          if (method === "auth_verify") {
            authed = true;
            console.log("✓ Authenticated with Yellow Network");

            // Send all transfers immediately (instant off-chain)
            console.log(`\n💸 Sending ${transactions.length} instant transfers...`);
            for (const tx of transactions) {
              // ytest.usd has 6 decimals: amount "5" → "5000000"
              const amountMicro = (parseFloat(tx.amount) * 1_000_000).toString();
              console.log(`  → ${tx.amount} ytest.usd (${amountMicro} units) → ${tx.recipientAddress.slice(0, 12)}...`);

              const transferMsg = await createTransferMessage(
                sessionSigner,
                {
                  destination: tx.recipientAddress as `0x${string}`,
                  allocations: [{ asset: tx.asset, amount: amountMicro }],
                },
                Date.now()
              );
              ws.send(transferMsg);
              transfersSent++;
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          // Transfer confirmed (Yellow sends "transfer" for each)
          if (method === "transfer") {
            transfersConfirmed++;
            const txData = resp.res[2]?.transactions?.[0];
            const tx = transactions[transfersConfirmed - 1];
            if (tx) {
              tx.status = "completed";
              tx.yellowTxId = txData?.id;
              this.completedTransactions.push(tx);
              console.log(`  ✓ Transfer ${transfersConfirmed}/${transfersSent} confirmed (Yellow TX #${txData?.id})`);
            }

            if (transfersConfirmed >= transfersSent) {
              // All Yellow off-chain transfers done → settle on-chain
              console.log(`\n⛓️  All ${transfersSent} off-chain transfers confirmed!`);
              console.log(`⛓️  Settling on-chain (minting TXTC to recipients)...`);
              await this.settleOnChain(transactions);
              console.log("🔒 Closing Yellow session...");
              finish(true);
            }
          }

          // Transaction notification (informational, don't count as confirmation)
          if (method === "tr") {
            // Yellow sends "tr" as a ledger transaction log — just log it
            const txInfo = resp.res[2]?.transactions?.[0];
            if (txInfo) {
              console.log(`  📝 Ledger TX #${txInfo.id}: ${txInfo.amount} ${txInfo.asset} ${txInfo.from_account?.slice(0,8)}→${txInfo.to_account?.slice(0,8)}`);
            }
          }

          // Balance update (informational)
          if (method === "bu") {
            const updates = resp.res[2]?.balance_updates;
            if (updates?.length > 0) {
              this.ledgerBalance = updates[0].amount;
            }
          }

          // Error response via res[1] === "error" (transfer-level errors)
          if (method === "error") {
            const errDetail = resp.res[2]?.error || resp.res[2]?.message || JSON.stringify(resp.res[2]);
            console.error(`  ❌ Transfer error: ${errDetail}`);
            // Count as a "confirmed" (failed) transfer so we don't hang
            transfersConfirmed++;
            const tx = transactions[transfersConfirmed - 1];
            if (tx && tx.status === "processing") {
              tx.status = "failed";
              this.completedTransactions.push(tx);
            }

            if (transfersConfirmed >= transfersSent) {
              const completed = transactions.filter((t) => t.status === "completed");
              console.log(`\n⛓️  ${completed.length}/${transfersSent} off-chain transfers succeeded`);
              if (completed.length > 0) {
                console.log(`⛓️  Settling ${completed.length} on-chain...`);
                await this.settleOnChain(transactions);
              }
              console.log("🔒 Closing Yellow session...");
              finish(completed.length > 0);
            }
          }

          // Log unknown methods for debugging
          const known = ["auth_challenge", "auth_verify", "transfer", "tr", "bu", "assets", "channels", "error"];
          if (method && !known.includes(method)) {
            console.log(`  📨 Unknown msg: ${method}`);
          }
        } catch (err: any) {
          console.error("❌ Message error:", err?.message);
          clearTimeout(timeout);
          this.isProcessing = false;
          reject(err);
          try { ws.close(); } catch (_) {}
        }
      });

      ws.on("error", (err: any) => {
        console.error("❌ WebSocket error:", err?.message);
        clearTimeout(timeout);
        this.isProcessing = false;
        reject(err);
      });

      ws.on("close", () => {
        console.log("🔌 Disconnected from Yellow Network");
      });
    });
  }

  // ========================================================================
  // ON-CHAIN SETTLEMENT: Mint TXTC to recipients after Yellow confirms
  // ========================================================================

  private async settleOnChain(transactions: PendingTransaction[]) {
    for (const tx of transactions) {
      if (tx.status !== "completed") continue;
      try {
        console.log(`  ⛓️  Settling ${tx.amount} ${tx.token} → ${tx.recipientAddress.slice(0, 12)}...`);
        const response = await fetch(`${BACKEND_URL}/api/yellow/settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientAddress: tx.recipientAddress,
            amount: tx.amount,
            txId: tx.id,
            token: tx.token,
            fromAddress: tx.fromAddress,
            senderKey: tx.senderKey,
            userPhone: tx.userPhone,
          }),
        });
        const result = (await response.json()) as any;
        if (result.success) {
          console.log(`    ✅ On-chain TX: ${result.txHash}`);
        } else {
          console.error(`    ⚠️  Settle failed: ${result.error}`);
        }
      } catch (err: any) {
        console.error(`    ⚠️  Settle error: ${err?.message}`);
      }
    }
  }

  // ========================================================================
  // FALLBACK: On-chain TXTC mint if Yellow is unavailable
  // ========================================================================

  private async fallbackOnChain(transactions: PendingTransaction[]) {
    console.log(`\n⚠️  On-chain fallback for ${transactions.length} transactions`);

    for (const tx of transactions) {
      try {
        console.log(`  💸 ${tx.amount} ${tx.token} → ${tx.recipientAddress.slice(0, 12)}...`);
        const response = await fetch(`${BACKEND_URL}/api/yellow/settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientAddress: tx.recipientAddress,
            amount: tx.amount,
            txId: tx.id,
            token: tx.token,
            fromAddress: tx.fromAddress,
            senderKey: tx.senderKey,
            userPhone: tx.userPhone,
          }),
        });
        const result = (await response.json()) as any;
        if (result.success) {
          console.log(`    ✅ On-chain: ${result.txHash}`);
          tx.status = "completed";
        } else {
          console.error(`    ❌ Failed: ${result.error}`);
          tx.status = "failed";
        }
      } catch (err: any) {
        console.error(`    ❌ Error: ${err?.message}`);
        tx.status = "failed";
      }
      this.completedTransactions.push(tx);
    }

    this.pendingTransactions = this.pendingTransactions.filter(
      (tx) => tx.status === "pending"
    );
    this.isProcessing = false;
    console.log(`✅ Fallback complete\n`);
  }

  // ========================================================================
  // STATUS
  // ========================================================================

  public getStatus() {
    return {
      sessionActive: this.isProcessing,
      pendingTransactions: this.pendingTransactions.filter(
        (tx) => tx.status === "pending"
      ).length,
      totalQueued: this.pendingTransactions.length,
      totalCompleted: this.completedTransactions.length,
      batchesProcessed: this.batchCount,
      wallet: this.account.address,
      ledgerBalance: this.ledgerBalance,
      mode: "nitrolite_unified_balance",
    };
  }

  public getPendingTransactions() {
    return [...this.pendingTransactions];
  }

  public getCompletedTransactions() {
    return [...this.completedTransactions];
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

let batchServiceInstance: YellowBatchService | null = null;

export function initializeBatchService(privateKey: `0x${string}`) {
  if (!batchServiceInstance) {
    batchServiceInstance = new YellowBatchService(privateKey);
  }
  return batchServiceInstance;
}

export function getBatchService(): YellowBatchService {
  if (!batchServiceInstance) {
    throw new Error("Batch service not initialized");
  }
  return batchServiceInstance;
}
