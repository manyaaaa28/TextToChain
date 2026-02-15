# ENS — Integrate ENS + Most Creative Use of ENS for DeFi

> **Track 1:** Integrate ENS — $3,500 (pool prize)
> **Track 2:** Most Creative Use of ENS for DeFi — $1,500

We are submitting for **both ENS tracks**.

---

## What We Built

Text-to-Chain makes ENS accessible to **2.5 billion feature phone users** who can't use ENS frontends. Users text `JOIN alice` and get `alice.ttcip.eth` — a fully on-chain ENS subdomain minted via a custom Solidity registrar. Every SMS command uses ENS for human-readable addressing.

```
SMS: "JOIN alice"
  → Create wallet for user
  → Custom Registrar: registerSubdomain("alice", 0x...)
  → ENS Registry: setSubnodeOwner(ttcip.eth, keccak256("alice"), backend)
  → ENS Registry: setResolver(alice.ttcip.eth, PublicResolver)
  → Public Resolver: setAddr(alice.ttcip.eth, userAddress)
  → Public Resolver: setName(alice.ttcip.eth, "alice.ttcip.eth")
  → ENS Registry: setSubnodeOwner → transfer ownership to user
  → SMS: "Welcome! Your wallet: alice.ttcip.eth"
```

---

## ENS Integration Depth

### Custom Solidity Registrar
**Contract:** [`0xcD057A8AbF3832e65edF5d224313c6b4e6324F76`](https://sepolia.etherscan.io/address/0xcD057A8AbF3832e65edF5d224313c6b4e6324F76)

Custom smart contract that manages subdomain lifecycle:
- `isAvailable(name)` — check if subdomain is taken
- `registerSubdomain(name, owner)` — full 5-step on-chain registration
- `resolve(name)` — name → address resolution

### 5-Step On-Chain Registration

Every subdomain goes through a complete ENS Registry flow:

```
Step 1: setSubnodeOwner(ttcip.eth, keccak256(label), backend)
  → Creates subdomain node, backend becomes temporary owner

Step 2: setResolver(subdomain.ttcip.eth, PublicResolver)
  → Points subdomain to the Public Resolver

Step 3: setAddr(subdomain.ttcip.eth, userAddress)
  → Sets forward resolution (name → address)

Step 4: setName(subdomain.ttcip.eth, "subdomain.ttcip.eth")
  → Sets reverse record for ENS app human-readable display

Step 5: setSubnodeOwner(ttcip.eth, keccak256(label), userAddress)
  → Transfers ownership to the actual user
```

### Pure Rust Namehash (EIP-137)

Standalone Rust implementation of ENS namehash in `ens_service/src/ens.rs`:

```rust
pub fn namehash(name: &str) -> [u8; 32] {
    let mut node = [0u8; 32];
    if name.is_empty() { return node; }
    let labels: Vec<&str> = name.split('.').collect();
    for label in labels.into_iter().rev() {
        let label_hash = keccak256(label.as_bytes());
        let mut combined = Vec::with_capacity(64);
        combined.extend_from_slice(&node);
        combined.extend_from_slice(&label_hash);
        node = keccak256(&combined);
    }
    node
}
```

Tested against known values (`namehash("eth")`, `namehash("vitalik.eth")`).

### Parent Domain Registration (Commit-Reveal)

Full ENS commit-reveal flow in `ens_service/src/register.rs`:
1. `makeCommitment()` → generate commitment hash
2. `commit()` → submit on-chain
3. Wait for minimum commitment age (~60s on Sepolia)
4. `register()` → complete registration with payment

### TypeScript Production Service

`backend-integration/ens-service.ts` — used by the live API server:
- On-chain `isAvailable()` check
- Full 5-step registration via custom registrar
- On-chain `resolve()` for name → address
- `setName` on Public Resolver for ENS app display
- Fallback to in-memory store if contract unavailable

### Name Resolution in SMS Commands

ENS names are resolved on-chain for every `SEND` command:

```
SMS: "SEND 10 TXTC TO alice.ttcip.eth"
  → Custom Registrar: resolve("alice") → 0x742d35Cc...
  → Tokens transferred on-chain
  → SMS: "Sent 10 TXTC to alice.ttcip.eth"
```

---

## ENS Contracts Used

| Contract | Address (Sepolia) |
|----------|-------------------|
| **ENS Registry** | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| **Public Resolver** | `0x8FADE66B79cC9f707aB26799354482EB93a5B7dD` |
| **ETH Registrar Controller** | `0xFED6a969AaA60E4961FCD3EBF1A2e8913ac65B72` |
| **TTC Subdomain Registrar** | `0xcD057A8AbF3832e65edF5d224313c6b4e6324F76` |

---

## Why This Is the Most Creative Use of ENS for DeFi

### The Problem
ENS is powerful but requires:
- A smartphone with a browser
- MetaMask or similar wallet extension
- Understanding of Ethereum addresses and gas

**2.5 billion feature phone users** are completely excluded.

### Our Solution: ENS via SMS

We turned ENS into an **SMS-native identity layer**:

1. **Registration via text** — `JOIN alice` creates `alice.ttcip.eth` on-chain. No browser, no MetaMask, no smartphone.

2. **Human-readable payments** — Users text `SEND 10 TXTC TO alice.ttcip.eth` instead of copying 42-character hex addresses. This is how ENS was meant to be used — but we made it work over SMS.

3. **Identity for the unbanked** — A feature phone user in rural India gets a globally verifiable on-chain identity (`swarn.ttcip.eth`) that works across all ENS-compatible apps.

4. **ENS as DeFi UX layer** — Every DeFi action (swap, send, redeem, cashout) uses ENS names. The hex address is completely hidden from the user.

5. **Reverse resolution for display** — We call `setName` so users' ENS names appear in ENS app, Etherscan, and any ENS-aware interface.

### What Makes It Creative

- **ENS without internet** — SMS works on 2G networks with no data plan
- **ENS without wallets** — Backend manages keys, user only knows their name
- **ENS as the entire UX** — Not an afterthought; ENS IS the interface
- **Cross-service identity** — Same ENS name works for SEND, SWAP, CASHOUT, BUY
- **On-chain sovereignty** — Despite SMS simplicity, subdomains are fully on-chain and user-owned (Step 5 transfers ownership)

---

## SMS Commands Using ENS

| Command | ENS Usage |
|---------|-----------|
| `JOIN alice` | Registers `alice.ttcip.eth` on-chain, maps to new wallet |
| `SEND 10 TXTC TO alice.ttcip.eth` | Resolves ENS → address, sends tokens |
| `SEND 10 TXTC TO alice` | Auto-appends `.ttcip.eth`, resolves, sends |
| `BALANCE` | Shows balance for user's ENS-linked wallet |
| `SWAP 5 TXTC` | Swaps from ENS-linked wallet |
| `CASHOUT 10 TXTC` | Cashes out from ENS-linked wallet |

---

## Source Code

### Rust ENS Service (`ens_service/`)

| File | Purpose |
|------|---------|
| [`src/ens.rs`](../ens_service/src/ens.rs) | Core: namehash (EIP-137), labelhash, `EnsMinter`, Registry + Resolver bindings |
| [`src/register.rs`](../ens_service/src/register.rs) | Parent domain registration (commit-reveal flow) |
| [`src/sms.rs`](../ens_service/src/sms.rs) | SMS conversation handler for ENS naming |
| [`src/main.rs`](../ens_service/src/main.rs) | Interactive CLI for testing |

### TypeScript ENS Service (`backend-integration/`)

| File | Purpose |
|------|---------|
| [`ens-service.ts`](../backend-integration/ens-service.ts) | Production ENS service — register, resolve, check availability |

### Smart Contract

| File | Purpose |
|------|---------|
| `Liquidity-pools/src/ENSSubdomainRegistrar.sol` | Custom registrar — isAvailable, registerSubdomain, resolve |

---

## Tests

```bash
# Rust tests
cd ens_service && cargo test
```

- `test_namehash_eth` — Verifies `namehash("eth")` matches known value
- `test_namehash_vitalik_eth` — Verifies `namehash("vitalik.eth")`
- `test_labelhash` — Verifies keccak256 label hashing
- `test_menu_flow` — SMS conversation flow
- `test_registration_flow` — Full registration via SMS

---

## Future Plans with ENS

1. **Text records** — Store user preferences (preferred currency, language) in ENS text records, accessible via SMS
2. **Avatar records** — Let users set profile pictures via SMS (`SET AVATAR <url>`)
3. **Multi-chain resolution** — Store addresses for multiple chains in ENS records, enable cross-chain SEND
4. **Decentralized website** — Host Text-to-Chain docs on IPFS via ENS content hash (`ttcip.eth` → IPFS)
5. **ENS-based address book** — `SAVE bob 0x...` stores contacts as ENS text records
6. **Wildcard resolution (ENSIP-10)** — Dynamic subdomains without on-chain registration for temporary/disposable wallets
7. **L2 subdomain migration** — Move subdomain registration to L2 for cheaper minting while keeping resolution on L1
