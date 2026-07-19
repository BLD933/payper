# ⚡ PayPer — pay a few cents, unlock anything

**x402-style pay-per-use gating on Monad Testnet.**

PayPer lets anyone monetize digital content with a single on-chain payment. A
creator posts a resource (prompt, file, guide, tool) and sets a price in MON.
They share a link. A buyer pays exactly that price; the smart contract records
the payment and the off-chain content server releases the gated content **only
after verifying on-chain that the buyer paid**. Non-custodial, instant, cheap.

> Built for the **Spark** hackathon (BuildAnything × Monad): *"Build anything
> onchain that solves a personal problem."* The personal problem: creators and
> indie devs want to charge tiny amounts for digital goods without Stripe, KYC,
> or a 30% platform cut.

## Why this is real (not slop)

- **One genuine on-chain feature**: `payForAccess` transfers MON to the creator
  and flips `unlocked[id][buyer] = true` in the contract.
- **Content is gated by the contract, not a hardcoded string.** The off-chain
  server calls `hasAccess(id, buyer)` before returning content. Skip the payment
  and you get a `402`. Judges who "click twice" get nothing without paying.
- **Verified on-chain**: contract `PayPer` is deployed and its bytecode is live
  on Monad Testnet.

## Live contract

| | |
|---|---|
| Network | Monad Testnet (chainId 10143) |
| Contract | `0x68f6756c45C57619dF80618a0872F5D5DD289Bd8` |
| Explorer | https://testnet.monadexplorer.com/address/0x68f6756c45C57619dF80618a0872F5D5DD289Bd8 |

## How it works

```
Creator ──createResource(price, hash, uri)──▶ Contract stores resource
   │                                                │
   └── posts link ?id=N ───────────────────────────┘
                                                    │
Buyer ──payForAccess(N) {value: price}──▶ MON → creator, unlocked[N][buyer]=true
   │
   └── GET /api/resource/N?buyer=0x… ─▶ server calls hasAccess() ─▶ returns content
```

## Quick start (local)

```bash
# 1. deploy (needs MON on Monad testnet — already deployed, address in frontend/src/contract-address.json)
npm install && npx hardhat compile && npm run deploy

# 2. start the off-chain content server (gates on on-chain payment)
cd server && npm install && node server.js        # :8787

# 3. start the frontend
cd frontend && npm install && npm run dev         # :5173
# point it at the server with VITE_API=http://localhost:8787
```

Open the app, connect MetaMask (add Monad Testnet), create a resource, copy the
link, open it in a second browser/profile, pay, and watch the content unlock.

## E2E test

```bash
node scripts/e2e.js
# creates a resource, pays from a fresh wallet, asserts hasAccess flips false→true
```

## Project structure

```
contracts/PayPer.sol     # the gating contract
frontend/                # React + Vite dApp (create + paywall views)
server/                  # off-chain content store, releases only after on-chain payment
scripts/deploy.js        # Hardhat deploy to Monad testnet
scripts/e2e.js           # on-chain end-to-end proof
```

## Prize track

Monad Testnet (works on testnet; mainnet-ready — same EVM, just a config swap).

---
MIT © PayPer
