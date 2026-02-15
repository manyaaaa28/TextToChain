// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TokenXYZ.sol";
import "../src/UniswapV3PoolManager.sol";

contract UniswapV3PoolManagerTest is Test {
    TokenXYZ public token;
    UniswapV3PoolManager public poolMgr;

    address public owner;
    address public user1;
    address public unauthorized;

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        unauthorized = makeAddr("unauthorized");

        token = new TokenXYZ();
        poolMgr = new UniswapV3PoolManager(address(token));
    }

    // ========================================================================
    // Deployment
    // ========================================================================

    function test_deployment() public view {
        assertEq(address(poolMgr.tokenXYZ()), address(token));
        assertEq(poolMgr.owner(), owner);
        assertEq(poolMgr.UNISWAP_V3_FACTORY(), 0x0227628f3F023bb0B980b67D528571c95c6DaC1c);
        assertEq(poolMgr.POSITION_MANAGER(), 0x1238536071E1c677A632429e3655c799b22cDA52);
        assertEq(poolMgr.SWAP_ROUTER(), 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E);
        assertEq(poolMgr.WETH9(), 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14);
        assertEq(poolMgr.POOL_FEE(), 3000);
        assertEq(poolMgr.TICK_SPACING(), 60);
        assertEq(poolMgr.tokenId(), 0);
    }

    function test_deployment_revertZeroAddress() public {
        vm.expectRevert("UniswapV3PoolManager: zero address");
        new UniswapV3PoolManager(address(0));
    }

    // ========================================================================
    // EntryPoint Management
    // ========================================================================

    function test_setEntryPoint() public {
        address ep = makeAddr("entrypoint");
        poolMgr.setEntryPoint(ep);
        assertEq(poolMgr.entryPoint(), ep);
    }

    function test_setEntryPoint_revertZeroAddress() public {
        vm.expectRevert("UniswapV3PoolManager: zero address");
        poolMgr.setEntryPoint(address(0));
    }

    function test_setEntryPoint_revertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        poolMgr.setEntryPoint(makeAddr("ep"));
    }

    // ========================================================================
    // Pool Operations (revert without pool)
    // ========================================================================

    function test_getPool_returnsZeroBeforeCreation() public view {
        assertEq(poolMgr.getPool(), address(0));
    }

    function test_getCurrentPrice_revertNoPool() public {
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        poolMgr.getCurrentPrice();
    }

    function test_getPoolLiquidity_revertNoPool() public {
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        poolMgr.getPoolLiquidity();
    }

    function test_addLiquidity_revertNoPool() public {
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        poolMgr.addLiquidity(100, 100, -60, 60);
    }

    function test_removeLiquidity_revertNoPosition() public {
        vm.expectRevert("UniswapV3PoolManager: no position");
        poolMgr.removeLiquidity(100);
    }

    // ========================================================================
    // Access Control
    // ========================================================================

    function test_createPool_revertNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", unauthorized));
        poolMgr.createPool(1 << 96);
    }

    function test_addLiquidity_revertNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", unauthorized));
        poolMgr.addLiquidity(100, 100, -60, 60);
    }

    function test_removeLiquidity_revertNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", unauthorized));
        poolMgr.removeLiquidity(100);
    }

    function test_swapTokenForEth_revertUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert("UniswapV3PoolManager: unauthorized");
        poolMgr.swapTokenForEth(100, user1, 0);
    }

    function test_swapEthForToken_revertUnauthorized() public {
        vm.deal(unauthorized, 1 ether);
        vm.prank(unauthorized);
        vm.expectRevert("UniswapV3PoolManager: unauthorized");
        poolMgr.swapEthForToken{value: 1 ether}(1 ether, user1, 0);
    }

    function test_swapTokenForEth_revertNoPool() public {
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        poolMgr.swapTokenForEth(100, user1, 0);
    }

    function test_swapEthForToken_revertNoPool() public {
        vm.deal(owner, 1 ether);
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        poolMgr.swapEthForToken{value: 1 ether}(1 ether, user1, 0);
    }

    // ========================================================================
    // Receive ETH
    // ========================================================================

    function test_receiveETH() public {
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        (bool success,) = address(poolMgr).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(poolMgr).balance, 1 ether);
    }

    // ========================================================================
    // Swap Authorization (entryPoint can call)
    // ========================================================================

    function test_swapTokenForEth_entryPointCanCall() public {
        address ep = makeAddr("entrypoint");
        poolMgr.setEntryPoint(ep);

        // Still reverts because no pool, but NOT because of authorization
        vm.prank(ep);
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        poolMgr.swapTokenForEth(100, user1, 0);
    }

    function test_swapEthForToken_entryPointCanCall() public {
        address ep = makeAddr("entrypoint");
        poolMgr.setEntryPoint(ep);

        vm.deal(ep, 1 ether);
        vm.prank(ep);
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        poolMgr.swapEthForToken{value: 1 ether}(1 ether, user1, 0);
    }
}
