// Minimal off-chain content store for PayPer.
// Stores gated content keyed by resource id. Serves it ONLY after verifying
// the requester has paid on-chain (calls the PayPer contract's hasAccess).
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { readFileSync } from "fs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
let CONTRACT = process.env.CONTRACT_ADDRESS;
try {
  const j = JSON.parse(readFileSync(new URL("../frontend/src/contract-address.json", import.meta.url)));
  if (j.PayPer && j.PayPer.startsWith("0x")) CONTRACT = j.PayPer;
} catch {}
const ABI = [
  "function hasAccess(uint256 id, address who) external view returns (bool)",
  "function resources(uint256 id) external view returns (tuple(address creator,uint256 price,bytes32 contentHash,string uri,bool active,uint256 totalEarned,uint256 accessCount))",
];

const store = new Map(); // id -> { title, content, creator }

app.post("/api/resource", (req, res) => {
  const { id, title, content, creator } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });
  store.set(String(id), { title, content, creator });
  res.json({ ok: true });
});

app.get("/api/resource/:id", async (req, res) => {
  const id = req.params.id;
  const who = req.query.buyer;
  const item = store.get(id);
  if (!item) return res.status(404).json({ error: "not found" });
  if (!CONTRACT) return res.status(503).json({ error: "contract not configured" });
  if (!who) return res.status(402).json({ error: "payment proof required", title: item.title });
  try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(CONTRACT, ABI, provider);
    const ok = await c.hasAccess(id, who);
    if (!ok) return res.status(402).json({ error: "not paid", title: item.title });
    res.json({ title: item.title, content: item.content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`PayPer content server on :${PORT}`));
