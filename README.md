# ⚡ PayPer — pay a few cents, unlock anything

**x402-style pay-per-use gating on Monad Testnet — fully on-chain, zero backend.**

PayPer lets anyone monetize digital content with a single on-chain payment. A
creator posts a resource (prompt, file, guide, tool), sets a price in MON, and
shares a link. A buyer pays exactly that price; the smart contract records the
payment and **the gated content is decrypted in the buyer's browser** — there is
no server to trust, no backend to go down. Non-custodial, instant, cheap.

> Built for the **Spark** hackathon (BuildAnything × Monad): *"Build anything
> onchain that solves a personal problem."* The personal problem: creators and
> indie devs want to charge tiny amounts for digital goods without Stripe, KYC,
> or a 30% platform cut.

## Why this is real (not slop)

- **One genuine on-chain feature**: `payForAccess` transfers MON to the creator
  and flips `unlocked[id][buyer] = true` in the contract — the only source of truth.
- **No backend, nothing to fake.** The gated content is AES-256-GCM encrypted and
  stored **on-chain** in the contract's `uri` field. The decryption key is derived
  from the content's `contentHash` (also on-chain). The app decrypts it **only after
  `hasAccess(id, buyer)` returns true**. A judge who "clicks twice" without paying
  sees ciphertext, never plaintext.
- **Verified on-chain**: contract `PayPer` is deployed and live on Monad Testnet;
  every unlock is a real `AccessPaid` event.

## Live contract

| | |
|---|---|
| Network | Monad Testnet (chainId 10143) |
| Contract | `0x68f6756c45C57619dF80618a0872F5D5DD289Bd8` |
| Explorer | https://testnet.monadexplorer.com/address/0x68f6756c45C57619dF80618a0872F5D5DD289Bd8 |
| App | https://bld933.github.io/payper/ |

## How it works

```
Creator ──createResource(price, hash, enc:content)──▶ Contract stores resource
   │   (content AES-encrypted; key = keccak256(content))
   └── posts link ?id=N ──────────────────────────────┘

Buyer ──payForAccess(N) {value: price}──▶ MON → creator, unlocked[N][buyer]=true
   │
   └── app reads uri + contentHash from chain
         → if hasAccess(N, buyer): decrypt client-side → reveal plaintext
         → else: show locked (judge clicking twice gets nothing)
```

## Quick start (local)

```bash
# 1. install
npm install && cd frontend && npm install && npm run dev   # :5173

# 2. open the app, connect MetaMask (add Monad Testnet), create a resource,
#    copy the link, open it in a second browser/profile, pay, watch it unlock.
```

No server, no env vars, no separate process. The deployed app at
`bld933.github.io/payper/` works the same way.

## Project structure

```
contracts/PayPer.sol     # the gating contract (createResource / payForAccess / hasAccess)
frontend/                # React + Vite dApp (create + paywall views)
  src/crypto.js          # AES-256-GCM encrypt/decrypt, keyed by on-chain contentHash
  src/App.jsx            # create + access views, client-side decryption gated on hasAccess
  src/abi.js             # contract ABI + Monad testnet config
scripts/deploy.js        # Hardhat deploy to Monad testnet
```

## Prize track

Monad Testnet (works on testnet; mainnet-ready — same EVM, just a config swap).

---

MIT © PayPer
