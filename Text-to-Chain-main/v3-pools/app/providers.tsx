"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { injected, walletConnect } from "wagmi/connectors";

const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    injected(), // MetaMask, Coinbase Wallet, etc.
    walletConnect({
      projectId:
        process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
    }),
  ],
  transports: {
    [mainnet.id]: http(
      process.env.NEXT_PUBLIC_RPC_URL || "https://eth.llamarpc.com",
    ),
    [sepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
