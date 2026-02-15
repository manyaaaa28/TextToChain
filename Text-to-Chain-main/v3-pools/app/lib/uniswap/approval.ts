import { ethers } from "ethers";
import { ERC20_ABI, NONFUNGIBLE_POSITION_MANAGER_ADDRESS } from "../constants";

export async function getTokenTransferApproval(
  tokenAddress: string,
  amount: bigint,
  signer: ethers.Signer,
): Promise<ethers.ContractTransactionResponse> {
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

  return await tokenContract.approve(
    NONFUNGIBLE_POSITION_MANAGER_ADDRESS,
    amount,
  );
}

export async function checkAllowance(
  tokenAddress: string,
  owner: string,
  provider: ethers.Provider,
): Promise<bigint> {
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  return await tokenContract.allowance(
    owner,
    NONFUNGIBLE_POSITION_MANAGER_ADDRESS,
  );
}

export async function getTokenBalance(
  tokenAddress: string,
  owner: string,
  provider: ethers.Provider,
): Promise<bigint> {
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  return await tokenContract.balanceOf(owner);
}
