"use client";

import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { ethers } from "ethers";
import { Pool } from "@uniswap/v3-sdk";
import { createPosition } from "../uniswap/position";
import {
  prepareMintTransaction,
  executeMintTransaction,
} from "../uniswap/mint";
import { getTokenTransferApproval } from "../uniswap/approval";
import { ATOKEN_ADDRESS, WETH_ADDRESS } from "../constants";

export function useMintPosition() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const mintPosition = async (pool: Pool, amount0: string, amount1: string) => {
    if (!address || !walletClient) {
      setError("Wallet not connected");
      return;
    }

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      // Convert walletClient to ethers signer
      const provider = new ethers.BrowserProvider(walletClient as any);
      const signer = await provider.getSigner();

      // Step 1: Approve tokens
      console.log("Approving ATOKEN...");
      const approval0 = await getTokenTransferApproval(
        ATOKEN_ADDRESS,
        ethers.parseUnits(amount0, 18),
        signer,
      );
      await approval0.wait();

      console.log("Approving WETH...");
      const approval1 = await getTokenTransferApproval(
        WETH_ADDRESS,
        ethers.parseUnits(amount1, 18),
        signer,
      );
      await approval1.wait();

      // Step 2: Create position
      console.log("Creating position...");
      const position = createPosition(pool, amount0, amount1);

      // Step 3: Prepare and execute mint transaction
      console.log("Minting position...");
      const transactionParams = prepareMintTransaction(position, address);
      const tx = await executeMintTransaction(transactionParams, signer);

      setTxHash(tx.hash);
      await tx.wait();

      console.log("Position minted successfully!");
    } catch (err) {
      console.error("Error minting position:", err);
      setError(err instanceof Error ? err.message : "Failed to mint position");
    } finally {
      setLoading(false);
    }
  };

  return { mintPosition, loading, error, txHash };
}
