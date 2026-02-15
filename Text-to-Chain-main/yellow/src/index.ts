import {
  NitroliteClient,
  WalletStateSigner,
  createTransferMessage,
  createGetConfigMessage,
  createECDSAMessageSigner,
  createEIP712AuthMessageSigner,
  createAuthVerifyMessageFromChallenge,
  createCreateChannelMessage,
  createResizeChannelMessage,
  createAuthRequestMessage,
  createCloseChannelMessage,
} from "@erc7824/nitrolite";
import type { RPCAsset } from "@erc7824/nitrolite";
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import WebSocket from "ws";
import "dotenv/config";
import * as readline from "readline";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLEARNODE_WS_URL = "wss://clearnet-sandbox.yellow.com/ws";
const CUSTODY_ADDRESS = "0x019B65A265EB3363822f2752141b3dF16131b262";
const ADJUDICATOR_ADDRESS = "0x7c7ccbc98469190849BCC6c926307794fDfB11F2";
const CHALLENGE_DURATION = 3600n;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const askQuestion = (query: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
};

// ============================================================================
// SETUP
// ============================================================================

console.log("🚀 Yellow Network Payment App\n");

// Get private key
let PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  const inputKey = await askQuestion("Enter your Private Key: ");
  if (!inputKey) throw new Error("Private Key is required");
  PRIVATE_KEY = inputKey.startsWith("0x")
    ? (inputKey as `0x${string}`)
    : (`0x${inputKey}` as `0x${string}`);
}

const account = privateKeyToAccount(PRIVATE_KEY);
console.log("✓ Wallet Address:", account.address);

// Setup clients
const RPC_URL = process.env.ALCHEMY_RPC_URL || "https://1rpc.io/sepolia";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(RPC_URL),
  account,
});

// ============================================================================
// FETCH CONFIGURATION
// ============================================================================

interface Config {
  assets?: RPCAsset[];
  [key: string]: any;
}

async function fetchConfig(): Promise<Config> {
  const signer = createECDSAMessageSigner(PRIVATE_KEY);
  const message = await createGetConfigMessage(signer);
  const ws = new WebSocket(CLEARNODE_WS_URL);

  return new Promise((resolve, reject) => {
    ws.onopen = () => ws.send(message);
    ws.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data.toString());
        if (response.res && response.res[2]) {
          resolve(response.res[2] as Config);
          ws.close();
        } else if (response.error) {
          reject(new Error(response.error.message));
          ws.close();
        }
      } catch (err) {
        reject(err);
        ws.close();
      }
    };
    ws.onerror = (error) => {
      reject(error);
      ws.close();
    };
  });
}

console.log("📡 Fetching network configuration...");
const config = await fetchConfig();
const supportedAsset = config.assets?.find(
  (a: any) => a.chain_id === sepolia.id,
);
console.log(config.assets);
const TOKEN_ADDRESS =
  supportedAsset?.token || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
console.log("✓ Configuration loaded");
console.log("✓ Token Address:", TOKEN_ADDRESS);

// ============================================================================
// INITIALIZE CLIENT
// ============================================================================

const client = new NitroliteClient({
  publicClient,
  walletClient,
  stateSigner: new WalletStateSigner(walletClient),
  addresses: {
    custody: CUSTODY_ADDRESS,
    adjudicator: ADJUDICATOR_ADDRESS,
  },
  chainId: sepolia.id,
  challengeDuration: CHALLENGE_DURATION,
});

console.log("✓ Client initialized\n");

// ============================================================================
// MAIN PAYMENT FLOW
// ============================================================================

// Generate session keypair
const sessionPrivateKey = generatePrivateKey();
const sessionAccount = privateKeyToAccount(sessionPrivateKey);
const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);

console.log("🔐 Session Key:", sessionAccount.address);

// Get recipient address
const recipientInput = await askQuestion("\n💸 Enter recipient address: ");
if (!recipientInput) throw new Error("Recipient address is required");
const recipientAddress = recipientInput as `0x${string}`;

const paymentAmount = await askQuestion("💰 Enter amount to send (e.g., 10): ");
if (!paymentAmount) throw new Error("Payment amount is required");

console.log(
  `\n📤 Preparing to send ${paymentAmount} USDC to ${recipientAddress}\n`,
);

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

const ws = new WebSocket(CLEARNODE_WS_URL);
let isAuthenticated = false;
let activeChannelId: string | undefined;

// Auth parameters
const authParams = {
  session_key: sessionAccount.address,
  allowances: [
    {
      asset: "ytest.usd",
      amount: "1000000000",
    },
  ],
  expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
  scope: "payment.app",
};

ws.on("open", async () => {
  console.log("🔗 Connected to Yellow Network");
  const authRequestMsg = await createAuthRequestMessage({
    address: account.address,
    application: "Payment App",
    ...authParams,
  });
  ws.send(authRequestMsg);
});

ws.on("message", async (data) => {
  const response = JSON.parse(data.toString());

  if (response.error) {
    console.error("❌ Error:", response.error.message);
    process.exit(1);
  }

  // ========================================================================
  // 1. AUTHENTICATION
  // ========================================================================

  if (
    response.res &&
    response.res[1] === "auth_challenge" &&
    !isAuthenticated
  ) {
    console.log("🔑 Authenticating...");
    const challenge = response.res[2].challenge_message;
    const signer = createEIP712AuthMessageSigner(walletClient, authParams, {
      name: "Payment App",
    });
    const verifyMsg = await createAuthVerifyMessageFromChallenge(
      signer,
      challenge,
    );
    ws.send(verifyMsg);
  }

  if (response.res && response.res[1] === "auth_verify") {
    console.log("✓ Authentication successful\n📂 Creating payment channel...");
    isAuthenticated = true;

    const createChannelMsg = await createCreateChannelMessage(sessionSigner, {
      chain_id: sepolia.id,
      token: TOKEN_ADDRESS,
    });
    ws.send(createChannelMsg);
  }

  // ========================================================================
  // 2. CHANNEL CREATION
  // ========================================================================

  if (response.res && response.res[1] === "create_channel") {
    const { channel_id, channel, state, server_signature } = response.res[2];
    activeChannelId = channel_id;
    console.log("✓ Channel prepared:", channel_id);

    const unsignedInitialState = {
      intent: state.intent,
      version: BigInt(state.version),
      data: state.state_data,
      allocations: state.allocations.map((a: any) => ({
        destination: a.destination,
        token: a.token,
        amount: BigInt(a.amount),
      })),
    };

    console.log("⛓️  Creating channel on-chain...");
    const createResult = await client.createChannel({
      channel,
      unsignedInitialState,
      serverSignature: server_signature,
    });

    const txHash =
      typeof createResult === "string" ? createResult : createResult.txHash;
    console.log("✓ Transaction:", txHash);

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("✓ Channel created on-chain");
    await new Promise((r) => setTimeout(r, 5000));

    const fundAmount = BigInt(paymentAmount) + 5n;
    console.log(`\n💳 Funding channel with ${fundAmount} USDC...`);

    const resizeMsg = await createResizeChannelMessage(sessionSigner, {
      channel_id: channel_id as `0x${string}`,
      allocate_amount: fundAmount,
      funds_destination: account.address,
    });
    ws.send(resizeMsg);
  }

  // ========================================================================
  // 3. CHANNEL FUNDING (RESIZE)
  // ========================================================================

  if (response.res && response.res[1] === "resize_channel") {
    const { channel_id, state, server_signature } = response.res[2];
    console.log("✓ Channel funding prepared");

    const resizeState = {
      intent: state.intent,
      version: BigInt(state.version),
      data: state.state_data || state.data,
      allocations: state.allocations.map((a: any) => ({
        destination: a.destination,
        token: a.token,
        amount: BigInt(a.amount),
      })),
      channelId: channel_id,
      serverSignature: server_signature,
    };

    let proofStates: any[] = [];
    try {
      const onChainData = await client.getChannelData(
        channel_id as `0x${string}`,
      );
      if (onChainData.lastValidState)
        proofStates = [onChainData.lastValidState];
    } catch (e) {
      console.log("Note: No proof states found (first resize)");
    }

    console.log("⛓️  Submitting resize to chain...");
    const { txHash } = await client.resizeChannel({ resizeState, proofStates });
    console.log("✓ Channel funded:", txHash);
    await new Promise((r) => setTimeout(r, 3000));

    // ====================================================================
    // 4. PAYMENT TRANSFER
    // ====================================================================

    console.log(`\n💸 Sending ${paymentAmount} USDC to ${recipientAddress}...`);
    const transferMsg = await createTransferMessage(
      sessionSigner,
      {
        destination: recipientAddress,
        allocations: [{ asset: "ytest.usd", amount: paymentAmount }],
      },
      Date.now(),
    );
    ws.send(transferMsg);
  }

  // ========================================================================
  // 5. TRANSFER COMPLETE
  // ========================================================================

  if (response.res && response.res[1] === "transfer") {
    console.log("\n✅ Payment Complete!");
    console.log(`   Amount: ${paymentAmount} USDC`);
    console.log(`   Recipient: ${recipientAddress}`);

    if (activeChannelId) {
      console.log("\n🔒 Closing channel...");
      const closeMsg = await createCloseChannelMessage(
        sessionSigner,
        activeChannelId as `0x${string}`,
        account.address,
      );
      ws.send(closeMsg);
    }
  }

  // ========================================================================
  // 6. CHANNEL CLOSING & WITHDRAWAL
  // ========================================================================

  if (response.res && response.res[1] === "close_channel") {
    const { channel_id, state, server_signature } = response.res[2];
    console.log("⛓️  Closing channel on-chain...");

    const txHash = await client.closeChannel({
      finalState: {
        intent: state.intent,
        version: BigInt(state.version),
        data: state.state_data || state.data,
        allocations: state.allocations.map((a: any) => ({
          destination: a.destination,
          token: a.token,
          amount: BigInt(a.amount),
        })),
        channelId: channel_id,
        serverSignature: server_signature,
      },
      stateData: state.state_data || state.data || "0x",
    });

    console.log("✓ Channel closed:", txHash);
    await new Promise((r) => setTimeout(r, 2000));

    const custodyAbi = [
      {
        type: "function",
        name: "getAccountsBalances",
        inputs: [
          { name: "users", type: "address[]" },
          { name: "tokens", type: "address[]" },
        ],
        outputs: [{ type: "uint256[]" }],
        stateMutability: "view",
      },
    ] as const;

    const balances = (await publicClient.readContract({
      address: CUSTODY_ADDRESS as `0x${string}`,
      abi: custodyAbi,
      functionName: "getAccountsBalances",
      args: [[account.address], [TOKEN_ADDRESS as `0x${string}`]],
    })) as bigint[];

    const withdrawableBalance = balances[0];

    if (withdrawableBalance > 0n) {
      console.log(`\n💰 Withdrawing ${withdrawableBalance} from custody...`);
      const withdrawalTx = await client.withdrawal(
        TOKEN_ADDRESS as `0x${string}`,
        withdrawableBalance,
      );
      console.log("✓ Withdrawal complete:", withdrawalTx);
    }

    console.log("\n✅ Payment flow complete!");
    process.exit(0);
  }
});

ws.on("error", (error) => {
  console.error("❌ WebSocket error:", error);
  process.exit(1);
});

ws.on("close", () => {
  console.log("🔌 Connection closed");
});
