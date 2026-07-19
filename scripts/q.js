const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const p = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
const C = "0x68f6756c45C57619dF80618a0872F5D5DD289Bd8";
const ABI = [
  "function resources(uint256) view returns (address creator, uint256 price, bytes32 contentHash, string uri, bool active, uint256 accessCount)",
  "function hasAccess(uint256 id, address who) view returns (bool)",
];
(async()=>{
  const w = new ethers.Wallet(process.env.PRIVATE_KEY);
  const c = new ethers.Contract(C, ABI, p);
  const r = await c.resources(8);
  console.log("resource 8:", { creator:r.creator, price:ethers.formatEther(r.price), active:r.active, accessCount:r.accessCount.toString() });
  console.log("hasAccess(8, deployer):", await c.hasAccess(8, w.address));
})();
