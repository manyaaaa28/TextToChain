// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TokenXYZ.sol";
import "../src/VoucherManager.sol";
import "../src/UniswapV3PoolManager.sol";
import "../src/EntryPointV3.sol";

/**
 * @title DeployV3
 * @dev Deployment script for Uniswap V3 integration
 */
contract DeployV3 is Script {
    function run() external {
        string memory pkString = vm.envString("PRIVATE_KEY");
        uint256 deployerPrivateKey;
        
        // Handle private key with or without 0x prefix
        if (bytes(pkString).length > 2 && bytes(pkString)[0] == "0" && bytes(pkString)[1] == "x") {
            deployerPrivateKey = vm.parseUint(pkString);
        } else {
            deployerPrivateKey = vm.parseUint(string(abi.encodePacked("0x", pkString)));
        }
        
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy TokenXYZ
        console.log("\n1. Deploying TokenXYZ...");
        TokenXYZ tokenXYZ = new TokenXYZ();
        console.log("TokenXYZ deployed at:", address(tokenXYZ));
        
        // 2. Deploy VoucherManager
        console.log("\n2. Deploying VoucherManager...");
        VoucherManager voucherManager = new VoucherManager(address(tokenXYZ));
        console.log("VoucherManager deployed at:", address(voucherManager));
        
        // 3. Deploy UniswapV3PoolManager
        console.log("\n3. Deploying UniswapV3PoolManager...");
        UniswapV3PoolManager poolManager = new UniswapV3PoolManager(address(tokenXYZ));
        console.log("UniswapV3PoolManager deployed at:", address(poolManager));
        
        // 4. Deploy EntryPointV3
        console.log("\n4. Deploying EntryPointV3...");
        EntryPointV3 entryPoint = new EntryPointV3(
            address(tokenXYZ),
            address(voucherManager),
            payable(address(poolManager))
        );
        console.log("EntryPointV3 deployed at:", address(entryPoint));
        
        // 5. Setup permissions
        console.log("\n5. Setting up permissions...");
        tokenXYZ.addMinter(address(voucherManager));
        console.log("Added VoucherManager as minter");
        
        poolManager.setEntryPoint(address(entryPoint));
        console.log("Set EntryPoint in PoolManager");
        
        vm.stopBroadcast();
        
        // Print deployment summary
        console.log("\n========================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("========================================");
        console.log("Network: Sepolia");
        console.log("Deployer:", deployer);
        console.log("\nContract Addresses:");
        console.log("-------------------");
        console.log("TokenXYZ:              ", address(tokenXYZ));
        console.log("VoucherManager:        ", address(voucherManager));
        console.log("UniswapV3PoolManager:  ", address(poolManager));
        console.log("EntryPointV3:          ", address(entryPoint));
        console.log("\nUniswap V3 Addresses (Sepolia):");
        console.log("-------------------");
        console.log("Factory:               ", poolManager.UNISWAP_V3_FACTORY());
        console.log("Position Manager:      ", poolManager.POSITION_MANAGER());
        console.log("Swap Router:           ", poolManager.SWAP_ROUTER());
        console.log("WETH9:                 ", poolManager.WETH9());
        console.log("\nNext Steps:");
        console.log("1. Create Uniswap V3 pool: poolManager.createPool(sqrtPriceX96)");
        console.log("2. Add liquidity: poolManager.addLiquidity(...)");
        console.log("3. Test swaps via EntryPointV3");
        console.log("========================================\n");
    }
}
