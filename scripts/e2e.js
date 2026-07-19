require("dotenv").config();
const { ethers } = require("ethers");
const abi = require("../frontend/src/abi.js");

async function main() {
  const RPC = "https://testnet-rpc.monad.xyz";
  const provider = new ethers.JsonRpcProvider(RPC);
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const buyer = ethers.Wallet.createRandom().connect(provider);

  // fund buyer from deployer so it can pay
  const f = await deployer.sendTransaction({ to: buyer.address, value: ethers.parseEther("0.1") });
  await f.wait();

  const addr = require("../frontend/src/contract-address.json").PayPer;
  const contract = new ethers.Contract(addr, abi.PAYPER_ABI, deployer);

  const price = ethers.parseEther("0.01");
  const content = "SECRET: the answer is 42. Thanks for paying via PayPer on Monad!";
  const h = ethers.keccak256(ethers.toUtf8Bytes(content));

  console.log("buyer:", buyer.address);
  const tx = await contract.createResource(price, h, "inline://e2e-test");
  const receipt = await tx.wait();
  const ev = receipt.logs.map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find(e => e && e.name === "ResourceCreated");
  const id = ev.args.id.toString();
  console.log("created resource id:", id);

  const before = await contract.hasAccess(id, buyer.address);
  console.log("hasAccess before pay:", before);

  const cBuyer = contract.connect(buyer);
  const payTx = await cBuyer.payForAccess(id, { value: price });
  await payTx.wait();
  console.log("paid", ethers.formatEther(price), "MON");

  const after = await contract.hasAccess(id, buyer.address);
  console.log("hasAccess after pay:", after);

  console.log(after === true ? "E2E PASS ✅ (on-chain pay gates access)" : "E2E FAIL ❌");
}

main().catch(e => { console.error(e); process.exit(1); });
