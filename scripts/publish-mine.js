const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const RPC = "https://testnet-rpc.monad.xyz";
const CONTRACT = "0x68f6756c45C57619dF80618a0872F5D5DD289Bd8";
const ABI = [
  "function createResource(uint256 price, bytes32 contentHash, string uri) external returns (uint256 id)",
  "function resources(uint256 id) external view returns (address creator, uint256 price, bytes32 contentHash, string uri, bool active, uint256 totalEarned, uint256 accessCount)",
  "event ResourceCreated(uint256 indexed id, address indexed creator, uint256 price, bytes32 contentHash, string uri)"
];
(async () => {
  const w = new ethers.Wallet(process.env.PRIVATE_KEY, new ethers.JsonRpcProvider(RPC));
  const title = "my prompt";
  const content = "absdjhajubsujhusdbiuhiuuuuuuuuuuuuuuuuuuuuh";
  const price = ethers.parseEther("0.02");
  const h = ethers.keccak256(ethers.toUtf8Bytes(content));
  const c = new ethers.Contract(CONTRACT, ABI, w);
  const tx = await c.createResource(price, h, "inline://" + title);
  console.log("tx:", tx.hash);
  const r = await tx.wait();
  const iface = c.interface;
  const ev = r.logs.map(l => { try { return iface.parseLog(l); } catch { return null; } }).find(e => e && e.name === "ResourceCreated");
  const id = ev.args.id.toString();
  // store off-chain
  const api = process.env.VITE_API || "https://8bb2-105-72-199-33.ngrok-free.app";
  const res = await fetch(api + "/api/resource", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, title, content, creator: w.address }),
  });
  console.log("store status:", res.status);
  // confirm on-chain read
  const rd = await c.resources(id);
  console.log("onchain read -> active:", rd.active, "price:", ethers.formatEther(rd.price), "MON");
  console.log("LINK: https://bld933.github.io/payper/?id=" + id);
})().catch(e => { console.error("FAIL:", e.reason || e.message); process.exit(1); });
