"use client";

import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { mainnet } from "wagmi/chains";

export function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        {chain && chain.id !== mainnet.id && (
          <span className="px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-lg text-sm">
            ⚠️ Wrong Network
          </span>
        )}
        <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800 font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          {chain && <p className="text-xs text-green-600">{chain.name}</p>}
        </div>
        <button
          onClick={() => disconnect()}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm font-medium"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {connectors.map((connector) => (
        <button
          key={connector.id}
          onClick={() => connect({ connector })}
          disabled={isPending}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition font-semibold w-full sm:w-auto"
        >
          {isPending ? "Connecting..." : `Connect ${connector.name}`}
        </button>
      ))}
      {error && <p className="text-sm text-red-600 mt-2">{error.message}</p>}
    </div>
  );
}
