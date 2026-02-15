"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { usePool } from "../lib/hooks/usePool";
import { useMintPosition } from "../lib/hooks/usePosition";
import { ATOKEN, WETH, POOL_FEE } from "../lib/constants";

export function LiquidityForm() {
  const { address, isConnected } = useAccount();
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");

  const {
    pool,
    loading: poolLoading,
    error: poolError,
  } = usePool(ATOKEN, WETH, POOL_FEE);

  const {
    mintPosition,
    loading: mintLoading,
    error: mintError,
    txHash,
  } = useMintPosition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pool || !amount0 || !amount1) {
      return;
    }

    await mintPosition(pool, amount0, amount1);
  };

  if (!isConnected) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600">Please connect your wallet to continue</p>
      </div>
    );
  }

  if (poolLoading) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600">Loading pool data...</p>
      </div>
    );
  }

  if (poolError) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600">Error: {poolError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Add Liquidity</h2>

      <div className="mb-4 p-4 bg-gray-50 rounded">
        <p className="text-sm text-gray-600">Pool: ATOKEN/WETH</p>
        <p className="text-sm text-gray-600">Fee: 0.3%</p>
        {pool && (
          <p className="text-sm text-gray-600">
            Current Tick: {pool.tickCurrent}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            ATOKEN Amount
          </label>
          <input
            type="number"
            value={amount0}
            onChange={(e) => setAmount0(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000001"
            min="0"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">WETH Amount</label>
          <input
            type="number"
            value={amount1}
            onChange={(e) => setAmount1(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000001"
            min="0"
            required
          />
        </div>

        <button
          type="submit"
          disabled={mintLoading || !pool}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          {mintLoading ? "Minting Position..." : "Add Liquidity"}
        </button>
      </form>

      {mintError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{mintError}</p>
        </div>
      )}

      {txHash && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-600">
            Success! Transaction: {txHash.slice(0, 10)}...
          </p>
          <a
            href={`https://etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View on Etherscan
          </a>
        </div>
      )}
    </div>
  );
}
