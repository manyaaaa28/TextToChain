// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TokenXYZ.sol";

contract TokenXYZTest is Test {
    TokenXYZ public token;
    address public owner;
    address public minter;
    address public user1;
    address public user2;

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    function setUp() public {
        owner = address(this);
        minter = makeAddr("minter");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        token = new TokenXYZ();
    }

    // ========================================================================
    // Deployment
    // ========================================================================

    function test_deployment() public view {
        assertEq(token.name(), "TextChain Token");
        assertEq(token.symbol(), "TXTC");
        assertEq(token.decimals(), 18);
        assertEq(token.owner(), owner);
        assertEq(token.totalSupply(), 0);
        assertEq(token.MAX_SUPPLY(), 1_000_000_000 * 10 ** 18);
    }

    function test_ownerIsMinterByDefault() public view {
        assertTrue(token.minters(owner));
    }

    // ========================================================================
    // Minter Management
    // ========================================================================

    function test_addMinter() public {
        vm.expectEmit(true, false, false, false);
        emit MinterAdded(minter);

        token.addMinter(minter);
        assertTrue(token.minters(minter));
    }

    function test_addMinter_revertZeroAddress() public {
        vm.expectRevert("TokenXYZ: zero address");
        token.addMinter(address(0));
    }

    function test_addMinter_revertAlreadyMinter() public {
        token.addMinter(minter);
        vm.expectRevert("TokenXYZ: already a minter");
        token.addMinter(minter);
    }

    function test_addMinter_revertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        token.addMinter(minter);
    }

    function test_removeMinter() public {
        token.addMinter(minter);

        vm.expectEmit(true, false, false, false);
        emit MinterRemoved(minter);

        token.removeMinter(minter);
        assertFalse(token.minters(minter));
    }

    function test_removeMinter_revertNotMinter() public {
        vm.expectRevert("TokenXYZ: not a minter");
        token.removeMinter(minter);
    }

    function test_removeMinter_revertNotOwner() public {
        token.addMinter(minter);
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        token.removeMinter(minter);
    }

    // ========================================================================
    // Minting
    // ========================================================================

    function test_mint_byOwner() public {
        uint256 amount = 1000 * 10 ** 18;

        vm.expectEmit(true, false, false, true);
        emit TokensMinted(user1, amount);

        token.mint(user1, amount);
        assertEq(token.balanceOf(user1), amount);
        assertEq(token.totalSupply(), amount);
    }

    function test_mint_byMinter() public {
        token.addMinter(minter);
        uint256 amount = 500 * 10 ** 18;

        vm.prank(minter);
        token.mint(user1, amount);
        assertEq(token.balanceOf(user1), amount);
    }

    function test_mint_revertNotMinter() public {
        vm.prank(user1);
        vm.expectRevert("TokenXYZ: caller is not a minter");
        token.mint(user2, 100);
    }

    function test_mint_revertZeroAddress() public {
        vm.expectRevert("TokenXYZ: mint to zero address");
        token.mint(address(0), 100);
    }

    function test_mint_revertMaxSupply() public {
        uint256 maxSupply = token.MAX_SUPPLY();
        token.mint(user1, maxSupply);

        vm.expectRevert("TokenXYZ: max supply exceeded");
        token.mint(user1, 1);
    }

    function test_mint_exactMaxSupply() public {
        uint256 maxSupply = token.MAX_SUPPLY();
        token.mint(user1, maxSupply);
        assertEq(token.totalSupply(), maxSupply);
    }

    // ========================================================================
    // Burning
    // ========================================================================

    function test_burn() public {
        uint256 mintAmount = 1000 * 10 ** 18;
        uint256 burnAmount = 400 * 10 ** 18;

        token.mint(user1, mintAmount);

        vm.expectEmit(true, false, false, true);
        emit TokensBurned(user1, burnAmount);

        vm.prank(user1);
        token.burn(burnAmount);

        assertEq(token.balanceOf(user1), mintAmount - burnAmount);
        assertEq(token.totalSupply(), mintAmount - burnAmount);
    }

    function test_burnFrom_withAllowance() public {
        uint256 mintAmount = 1000 * 10 ** 18;
        uint256 burnAmount = 300 * 10 ** 18;

        token.mint(user1, mintAmount);

        vm.prank(user1);
        token.approve(user2, burnAmount);

        vm.expectEmit(true, false, false, true);
        emit TokensBurned(user1, burnAmount);

        vm.prank(user2);
        token.burnFrom(user1, burnAmount);

        assertEq(token.balanceOf(user1), mintAmount - burnAmount);
    }

    function test_burnFrom_revertNoAllowance() public {
        token.mint(user1, 1000 * 10 ** 18);

        vm.prank(user2);
        vm.expectRevert();
        token.burnFrom(user1, 100);
    }

    function test_burnFromAny_byOwner() public {
        uint256 mintAmount = 1000 * 10 ** 18;
        uint256 burnAmount = 500 * 10 ** 18;

        token.mint(user1, mintAmount);

        vm.expectEmit(true, false, false, true);
        emit TokensBurned(user1, burnAmount);

        token.burnFromAny(user1, burnAmount);
        assertEq(token.balanceOf(user1), mintAmount - burnAmount);
    }

    function test_burnFromAny_revertNotOwner() public {
        token.mint(user1, 1000 * 10 ** 18);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user2));
        token.burnFromAny(user1, 100);
    }

    // ========================================================================
    // ERC20 Standard
    // ========================================================================

    function test_transfer() public {
        uint256 amount = 100 * 10 ** 18;
        token.mint(user1, amount);

        vm.prank(user1);
        token.transfer(user2, amount);

        assertEq(token.balanceOf(user1), 0);
        assertEq(token.balanceOf(user2), amount);
    }

    function test_approve_and_transferFrom() public {
        uint256 amount = 100 * 10 ** 18;
        token.mint(user1, amount);

        vm.prank(user1);
        token.approve(user2, amount);

        vm.prank(user2);
        token.transferFrom(user1, user2, amount);

        assertEq(token.balanceOf(user1), 0);
        assertEq(token.balanceOf(user2), amount);
    }

    // ========================================================================
    // Fuzz Tests
    // ========================================================================

    function testFuzz_mint(uint256 amount) public {
        amount = bound(amount, 1, token.MAX_SUPPLY());
        token.mint(user1, amount);
        assertEq(token.balanceOf(user1), amount);
    }

    function testFuzz_burn(uint256 mintAmount, uint256 burnAmount) public {
        mintAmount = bound(mintAmount, 1, token.MAX_SUPPLY());
        burnAmount = bound(burnAmount, 1, mintAmount);

        token.mint(user1, mintAmount);

        vm.prank(user1);
        token.burn(burnAmount);

        assertEq(token.balanceOf(user1), mintAmount - burnAmount);
    }
}
