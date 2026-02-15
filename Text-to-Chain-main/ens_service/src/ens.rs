//! ENS (Ethereum Name Service) integration module
//! Handles on-chain subdomain minting on Sepolia testnet

use ethers::prelude::*;
use ethers::utils::keccak256;
use std::sync::Arc;

/// ENS Registry contract address (same on mainnet and Sepolia)
pub const ENS_REGISTRY: &str = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

/// Public Resolver contract address on Sepolia
pub const PUBLIC_RESOLVER_SEPOLIA: &str = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";

/// ETH Registrar Controller on Sepolia (for registering .eth domains)
pub const ETH_REGISTRAR_CONTROLLER_SEPOLIA: &str = "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968";

// Generate contract bindings for ENS Registry
abigen!(
    ENSRegistry,
    r#"[
        function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external returns (bytes32)
        function setResolver(bytes32 node, address resolver) external
        function owner(bytes32 node) external view returns (address)
        function resolver(bytes32 node) external view returns (address)
    ]"#
);

// Generate contract bindings for Public Resolver
abigen!(
    PublicResolver,
    r#"[
        function setAddr(bytes32 node, address addr) external
        function addr(bytes32 node) external view returns (address)
    ]"#
);

// Generate contract bindings for ETH Registrar Controller (for registering .eth domains)
abigen!(
    ETHRegistrarController,
    r#"[
        function available(string name) external view returns (bool)
        function rentPrice(string name, uint256 duration) external view returns (uint256 base, uint256 premium)
        function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) external pure returns (bytes32)
        function commit(bytes32 commitment) external
        function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) external payable
        function minCommitmentAge() external view returns (uint256)
    ]"#
);

/// Calculate the namehash of an ENS name
/// e.g., namehash("alice.ttc.eth") -> bytes32
pub fn namehash(name: &str) -> [u8; 32] {
    let mut node = [0u8; 32];
    
    if name.is_empty() {
        return node;
    }
    
    // Split by dots and process in reverse
    let labels: Vec<&str> = name.split('.').collect();
    for label in labels.into_iter().rev() {
        let label_hash = keccak256(label.as_bytes());
        // Concatenate node + labelhash and hash again
        let mut combined = Vec::with_capacity(64);
        combined.extend_from_slice(&node);
        combined.extend_from_slice(&label_hash);
        node = keccak256(&combined);
    }
    
    node
}

/// Calculate the labelhash (keccak256 of a label)
/// e.g., labelhash("alice") -> bytes32  
pub fn labelhash(label: &str) -> [u8; 32] {
    keccak256(label.as_bytes())
}

/// ENS Minter - handles on-chain subdomain registration
/// Uses concrete type to avoid lifetime issues with async
pub struct EnsMinter {
    registry: ENSRegistry<SignerMiddleware<Provider<Http>, LocalWallet>>,
    resolver: PublicResolver<SignerMiddleware<Provider<Http>, LocalWallet>>,
    parent_domain: String,
    parent_node: [u8; 32],
}

impl EnsMinter {
    /// Create a new ENS minter for a parent domain
    pub fn new(
        client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
        parent_domain: &str,
    ) -> eyre::Result<Self> {
        let registry_address: Address = ENS_REGISTRY.parse()?;
        let resolver_address: Address = PUBLIC_RESOLVER_SEPOLIA.parse()?;
        
        let registry = ENSRegistry::new(registry_address, client.clone());
        let resolver = PublicResolver::new(resolver_address, client);
        
        let parent_node = namehash(parent_domain);
        
        Ok(Self {
            registry,
            resolver,
            parent_domain: parent_domain.to_string(),
            parent_node,
        })
    }
    
    /// Check if we own the parent domain
    pub async fn verify_ownership(&self, expected_owner: Address) -> eyre::Result<bool> {
        let owner = self.registry.owner(self.parent_node).call().await?;
        Ok(owner == expected_owner)
    }
    
    /// Get the current owner of a subdomain
    pub async fn get_subdomain_owner(&self, label: &str) -> eyre::Result<Address> {
        let subdomain = format!("{}.{}", label.to_lowercase(), self.parent_domain);
        let node = namehash(&subdomain);
        let owner = self.registry.owner(node).call().await?;
        Ok(owner)
    }
    
    /// Mint a new subdomain
    /// This sets the subdomain owner and points it to the resolver
    pub async fn mint_subdomain(
        &self,
        label: &str,
        target_address: Address,
    ) -> eyre::Result<String> {
        let label = label.to_lowercase();
        let label_hash = labelhash(&label);
        let subdomain = format!("{}.{}", label, self.parent_domain);
        let subdomain_node = namehash(&subdomain);
        
        println!("📝 Step 1/3: Setting subdomain owner...");
        
        // Step 1: Set subnode owner (creates the subdomain)
        let tx = self.registry
            .set_subnode_owner(self.parent_node, label_hash, target_address);
        let pending = tx.send().await?;
        let receipt = pending.await?;
        
        if let Some(receipt) = receipt {
            println!("   ✅ Tx confirmed: {:?}", receipt.transaction_hash);
        }
        
        println!("📝 Step 2/3: Setting resolver...");
        
        // Step 2: Set the resolver for the subdomain
        let resolver_address: Address = PUBLIC_RESOLVER_SEPOLIA.parse()?;
        let tx = self.registry
            .set_resolver(subdomain_node, resolver_address);
        let pending = tx.send().await?;
        let receipt = pending.await?;
        
        if let Some(receipt) = receipt {
            println!("   ✅ Tx confirmed: {:?}", receipt.transaction_hash);
        }
        
        println!("📝 Step 3/3: Setting address record...");
        
        // Step 3: Set the address on the resolver
        let tx = self.resolver
            .set_addr(subdomain_node, target_address);
        let pending = tx.send().await?;
        let receipt = pending.await?;
        
        if let Some(receipt) = receipt {
            println!("   ✅ Tx confirmed: {:?}", receipt.transaction_hash);
        }
        
        Ok(subdomain)
    }
    
    /// Resolve a subdomain to its address
    pub async fn resolve_subdomain(&self, label: &str) -> eyre::Result<Address> {
        let subdomain = format!("{}.{}", label.to_lowercase(), self.parent_domain);
        let node = namehash(&subdomain);
        let addr = self.resolver.addr(node).call().await?;
        Ok(addr)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_namehash_eth() {
        // namehash("eth") should be a known value
        let hash = namehash("eth");
        let expected = hex::decode("93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae").unwrap();
        assert_eq!(hash.to_vec(), expected);
    }
    
    #[test]
    fn test_namehash_vitalik_eth() {
        // namehash("vitalik.eth") 
        let hash = namehash("vitalik.eth");
        let expected = hex::decode("ee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835").unwrap();
        assert_eq!(hash.to_vec(), expected);
    }
    
    #[test]
    fn test_labelhash() {
        // labelhash("vitalik") = keccak256("vitalik")
        let hash = labelhash("vitalik");
        let expected = hex::decode("af2caa1c2ca1d027f1ac823b529d0a67cd144264b2789fa2ea4d63a67c7103cc").unwrap();
        assert_eq!(hash.to_vec(), expected);
    }
}
