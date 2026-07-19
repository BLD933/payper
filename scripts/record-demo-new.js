const { chromium } = require("playwright");
const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const RPC = "https://testnet-rpc.monad.xyz";
const C = "0x68f6756c45C57619dF80618a0872F5D5DD289Bd8";
const ABI = require("../frontend/src/abi.js").PAYPER_ABI;

(async () => {
  const prov = new ethers.JsonRpcProvider(RPC);
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, prov);
  const buyer = ethers.Wallet.createRandom().connect(prov);
  await (await deployer.sendTransaction({ to: buyer.address, value: ethers.parseEther("0.05") })).wait();
  console.log("buyer funded:", buyer.address);

  const crypto = await import("../frontend/src/crypto.js");
  const plaintext = "This is the gated content that only paying users can see. Pay 0.01 MON on Monad Testnet to unlock it. The payment flips hasAccess on-chain, and the app decrypts the content client-side using the on-chain encryption key.";
  const h = ethers.keccak256(ethers.toUtf8Bytes(plaintext));
  const ciphertext = await crypto.encryptContent(plaintext, h);

  const contract = new ethers.Contract(C, ABI, deployer);
  const tx = await contract.createResource(ethers.parseEther("0.01"), h, "enc:" + ciphertext);
  const receipt = await tx.wait();
  const id = receipt.logs.map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find(e => e && e.name === "ResourceCreated").args.id;
  console.log("created resource id:", id.toString());

  const c2 = new ethers.Contract(C, ABI, buyer);
  const payTx = await c2.payForAccess(id, { value: ethers.parseEther("0.01") });
  await payTx.wait();
  const has = await c2.hasAccess(id, buyer.address);
  console.log("buyer hasAccess:", has);

  const r = await c2.resources(id);
  const decrypted = await crypto.decryptContent(r.uri.slice(4), r.contentHash);
  console.log("decrypt verified:", decrypted === plaintext);

  // Launch headless browser with mock wallet injected before any app code
  const b = await chromium.launch({ channel: "chrome", headless: false });
  const ctx = await b.newContext({
    viewport: { width: 1100, height: 820 },
    recordVideo: { dir: require("path").join(__dirname, "..", "demo"), size: { width: 1100, height: 820 } },
  });

  const p = await ctx.newPage();

  // addInitScript runs before page scripts; arg passes the buyer address
  await p.addInitScript((addr) => {
    window.ethereum = {
      _selectedAddress: addr,
      isMetaMask: true,
      chainId: "0x279f",
      get selectedAddress() { return this._selectedAddress; },
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [addr];
        if (method === "eth_chainId") return "0x279f";
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        const resp = await fetch("https://testnet-rpc.monad.xyz", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({jsonrpc:"2.0",id:1,method,params:params||[]}),
        });
        const j = await resp.json();
        if (j.error) throw new Error(j.error.message);
        return j.result;
      },
      on: () => {}, removeListener: () => {},
    };
  }, buyer.address);

  await p.goto("https://bld933.github.io/payper/?id=" + id, { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);

  // Click connect (mock wallet already injected, this should work)
  await p.click("button.conn").catch(() => {});
  await p.waitForTimeout(2000);

  // The app should auto-reveal since hasAccess is true for this wallet
  await p.waitForTimeout(4000);

  const finalText = await p.locator("body").innerText();
  console.log("=== PAGE CONTENT (first 500) ===");
  console.log(finalText.slice(0, 500));

  await p.waitForTimeout(3000);

  await ctx.close();
  await b.close();
  const v = await p.video().path();
  console.log("video saved:", v);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
