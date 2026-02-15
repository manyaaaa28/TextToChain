import { LiquidityForm } from "./components/LiquidityForm";
import { ConnectWallet } from "./components/ConnectWallet";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800">
            ATOKEN/WETH Liquidity Pool
          </h1>
          <ConnectWallet />
        </div>

        <LiquidityForm />
      </div>
    </main>
  );
}
