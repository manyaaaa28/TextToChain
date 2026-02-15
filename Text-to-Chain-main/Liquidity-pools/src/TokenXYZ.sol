// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenXYZ
 * @dev Custom ERC20 token for Text-to-Chain voucher system
 * @notice This token is minted when users redeem vouchers and can be swapped for ETH
 */
contract TokenXYZ is ERC20, ERC20Burnable, Ownable {
    
    mapping(address => bool) public minters;
    
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    
    modifier onlyMinter() {
        require(minters[msg.sender] || msg.sender == owner(), "TokenXYZ: caller is not a minter");
        _;
    }
    
    constructor() ERC20("TextChain Token", "TXTC") Ownable(msg.sender) {
        minters[msg.sender] = true;
    }
    
    /**
     * @dev Add a new minter (VoucherManager contract)
     * @param minter Address to grant minting rights
     */
    function addMinter(address minter) external onlyOwner {
        require(minter != address(0), "TokenXYZ: zero address");
        require(!minters[minter], "TokenXYZ: already a minter");
        minters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev Remove a minter
     * @param minter Address to revoke minting rights
     */
    function removeMinter(address minter) external onlyOwner {
        require(minters[minter], "TokenXYZ: not a minter");
        minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev Mint new tokens (called by VoucherManager on redemption)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyMinter {
        require(to != address(0), "TokenXYZ: mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "TokenXYZ: max supply exceeded");
        
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }
    
    /**
     * @dev Burn tokens from caller
     * @param amount Amount to burn
     */
    function burn(uint256 amount) public override {
        super.burn(amount);
        emit TokensBurned(msg.sender, amount);
    }
    
    /**
     * @dev Burn tokens from another account (with allowance)
     * @param account Account to burn from
     * @param amount Amount to burn
     */
    function burnFrom(address account, uint256 amount) public override {
        super.burnFrom(account, amount);
        emit TokensBurned(account, amount);
    }
    
    /**
     * @dev Owner can burn tokens from any account without approval (for swap service)
     * @param account Account to burn from
     * @param amount Amount to burn
     */
    function burnFromAny(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
        emit TokensBurned(account, amount);
    }
}
