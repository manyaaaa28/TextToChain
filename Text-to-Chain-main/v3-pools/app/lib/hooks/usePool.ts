"use client";

import { useState, useEffect } from "react";
import { Pool } from "@uniswap/v3-sdk";
import { Token } from "@uniswap/sdk-core";
import {
  getPoolAddress,
  getPoolState,
  createPoolInstance,
} from "../uniswap/pool";
import { ethers } from "ethers";

export function usePool(token0: Token, token1: Token, fee: number) {
  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPool() {
      setLoading(true);
      setError(null);

      try {
        // Get provider (you'll need to adapt this to your wagmi setup)
        const provider = new ethers.JsonRpcProvider(
          process.env.NEXT_PUBLIC_RPC_URL || "https://eth.llamarpc.com",
        );

        const poolAddress = await getPoolAddress(token0, token1, fee);
        const poolState = await getPoolState(poolAddress, provider);
        const poolInstance = createPoolInstance(token0, token1, fee, poolState);

        setPool(poolInstance);
      } catch (err) {
        console.error("Error loading pool:", err);
        setError(err instanceof Error ? err.message : "Failed to load pool");
      } finally {
        setLoading(false);
      }
    }

    loadPool();
  }, [token0, token1, fee]);

  return { pool, loading, error };
}
