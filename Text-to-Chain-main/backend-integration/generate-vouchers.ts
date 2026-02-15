/**
 * Generate voucher codes on-chain via VoucherManager contract.
 * 
 * Usage:
 *   npx ts-node generate-vouchers.ts <count> <amount_txtc>
 *   e.g. npx ts-node generate-vouchers.ts 10 100
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const VOUCHER_MANAGER = "0x3094e5820F911f9119D201B9E2DdD4b9cf792990";
const TXTC_ADDRESS = "0x4d054FB258A260982F0bFab9560340d33D9E698B";

const VOUCHER_ABI = [
  "function generateVoucher(bytes32 codeHash, uint256 tokenAmount) external",
  "function redeemVoucher(bytes32 code, address recipient) external",
  "function owner() view returns (address)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

async function main() {
  const count = parseInt(process.argv[2] || "10");
  const amountTxtc = process.argv[3] || "100";

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const address = await signer.getAddress();

  console.log(`\n🎫 Generating ${count} voucher codes (${amountTxtc} TXTC each)`);
  console.log(`   Wallet: ${address}\n`);

  const txtc = new ethers.Contract(TXTC_ADDRESS, ERC20_ABI, signer);
  const voucher = new ethers.Contract(VOUCHER_MANAGER, VOUCHER_ABI, signer);

  // Check TXTC balance
  const balance = await txtc.balanceOf(address);
  const totalNeeded = ethers.parseEther(amountTxtc) * BigInt(count);
  console.log(`   TXTC Balance: ${ethers.formatEther(balance)}`);
  console.log(`   Total needed: ${ethers.formatEther(totalNeeded)}\n`);

  if (balance < totalNeeded) {
    console.error("❌ Insufficient TXTC balance!");
    process.exit(1);
  }

  // Approve VoucherManager to spend TXTC
  const allowance = await txtc.allowance(address, VOUCHER_MANAGER);
  if (allowance < totalNeeded) {
    console.log("   Approving TXTC for VoucherManager...");
    const approveTx = await txtc.approve(VOUCHER_MANAGER, ethers.MaxUint256);
    await approveTx.wait();
    console.log("   ✅ Approved\n");
  }

  const codes: string[] = [];
  const amountWei = ethers.parseEther(amountTxtc);

  for (let i = 0; i < count; i++) {
    // Generate random 4-byte code (8 hex chars)
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    // Must match Solidity: keccak256(abi.encodePacked(code))
    const codeHash = ethers.keccak256(ethers.toUtf8Bytes(code));

    try {
      const tx = await voucher.generateVoucher(codeHash, amountWei);
      await tx.wait();
      codes.push(code);
      console.log(`   ${i + 1}. ${code} — ${amountTxtc} TXTC ✅`);
    } catch (error: any) {
      console.error(`   ${i + 1}. ${code} — FAILED: ${error.message}`);
    }
  }

  console.log(`\n✅ Generated ${codes.length} voucher codes:\n`);
  codes.forEach((code, i) => {
    console.log(`   ${i + 1}. ${code}`);
  });

  // Save to file
  const fs = require("fs");
  const output = codes.map((c, i) => `${i + 1}. ${c} (${amountTxtc} TXTC)`).join("\n");
  fs.writeFileSync("voucher-codes.md", `# Voucher Codes (${amountTxtc} TXTC each)\n\n${output}\n`);
  console.log(`\n📝 Saved to voucher-codes.md`);
}

main().catch(console.error);
