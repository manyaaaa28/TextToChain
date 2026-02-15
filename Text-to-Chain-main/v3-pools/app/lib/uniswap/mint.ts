import { ethers } from "ethers";
import { NonfungiblePositionManager, MintOptions } from "@uniswap/v3-sdk";
import { Percent } from "@uniswap/sdk-core";
import { Position } from "@uniswap/v3-sdk";
import {
  NONFUNGIBLE_POSITION_MANAGER_ADDRESS,
  SLIPPAGE_TOLERANCE,
  DEADLINE_MINUTES,
} from "../constants";

export interface MintTransactionParams {
  data: string;
  to: string;
  value: string;
  from: string;
}

export function prepareMintTransaction(
  position: Position,
  address: string,
): MintTransactionParams {
  const mintOptions: MintOptions = {
    recipient: address,
    deadline: Math.floor(Date.now() / 1000) + 60 * DEADLINE_MINUTES,
    slippageTolerance: new Percent(SLIPPAGE_TOLERANCE, 10_000),
  };

  const { calldata, value } = NonfungiblePositionManager.addCallParameters(
    position,
    mintOptions,
  );

  return {
    data: calldata,
    to: NONFUNGIBLE_POSITION_MANAGER_ADDRESS,
    value: value,
    from: address,
  };
}

export async function executeMintTransaction(
  transactionParams: MintTransactionParams,
  signer: ethers.Signer,
): Promise<ethers.ContractTransactionResponse> {
  const transaction = {
    data: transactionParams.data,
    to: transactionParams.to,
    value: transactionParams.value,
    from: transactionParams.from,
  };

  return await signer.sendTransaction(transaction);
}
