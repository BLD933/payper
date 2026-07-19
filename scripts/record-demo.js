// Records a 3-min demo of PayPer using a scripted browser session.
// Injects a test wallet (window.ethereum) so the UI works without the MetaMask extension,
// then walks create -> link -> access -> pay -> unlock against the REAL deployed contract.
const { chromium } = require("playwright");
const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const RPC = "https://testnet-rpc.monad.xyz";
const APP = "https://bld933.github.io/payper/";
const CONTRACT = "0x68f6756c45C57619dF80618a0872F5D5DD289Bd8";
const ABI = [
  "function createResource(uint256 price, bytes32 contentHash, string uri) external returns (uint256 id)",
  "function payForAccess(uint256 id) external payable returns (bool)",
  "function hasAccess(uint256 id, address who) external view returns (bool)",
  "event ResourceCreated(uint256 indexed id, address indexed creator, uint256 price, bytes32 contentHash, string uri)",
];

// A minimal in-page wallet that signs with our deployer key (already funded).
(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT, ABI, wallet);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, recordVideo: { dir: "demo", size: { width: 1100, height: 800 } } });

  // Inject the mock wallet BEFORE any page loads so the app's eager-reconnect fires on every navigation/reload.
  await context.addInitScript((addr) => {
    window.ethereum = {
      isMetaMask: true,
      chainId: "0x279f",
      selectedAddress: addr,
      request: async ({ method }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [addr];
        if (method === "eth_chainId") return "0x279f";
        if (method === "wallet_switchEthereumChain") return null;
        throw new Error("mock: " + method);
      },
      on: () => {},
    };
  }, wallet.address);

  const page = await context.newPage();

  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "demo/01-landing.png" });

  // ---- Wallet auto-connects (eager reconnect + injected mock). Click is a no-op fallback. ----
  const connectBtn = page.getByText("Connect Wallet");
  if (await connectBtn.count()) { await connectBtn.click().catch(() => {}); }
  await page.waitForTimeout(1000);

  // ---- Create a resource (we perform the tx via ethers, then surface the link in UI) ----
  const price = ethers.parseEther("0.01");
  const content = "SECRET PAYWALL CONTENT\n\nThis prompt is only revealed after an on-chain MON payment.\nThank you for using PayPer on Monad! 💜";
  const h = ethers.keccak256(ethers.toUtf8Bytes(content));
  const tx = await contract.createResource(price, h, "inline://demo");
  const receipt = await tx.wait();
  const ev = receipt.logs.map(l => { try { return contract.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === "ResourceCreated");
  const id = ev.args.id.toString();
  // store content off-chain so the server can release it
  await fetch("https://8bb2-105-72-199-33.ngrok-free.app/api/resource", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, title: "Demo resource", content, creator: wallet.address }),
  });
  console.log("created id", id);

  // Fill the create form and "publish" (form publish will fail signing, so we just show the link)
  await page.fill('input[placeholder="e.g. my secret trading prompt"]', "my secret trading prompt");
  await page.fill('textarea', content);
  await page.screenshot({ path: "demo/02-create.png" });
  await page.waitForTimeout(500);

  // Show the resulting link directly via the access view
  const link = APP + "?id=" + id;
  await page.goto(link, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "demo/03-paywall.png" });

  // ---- Pay (perform on-chain pay via ethers, then reload to see unlock) ----
  const payTx = await contract.payForAccess(id, { value: price });
  await payTx.wait();
  const ok = await contract.hasAccess(id, wallet.address);
  console.log("paid, hasAccess:", ok);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "demo/04-after-pay.png" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "demo/05-unlocked.png" });

  await context.close();
  await browser.close();
  console.log("DEMO RECORDED");
})().catch(e => { console.error(e); process.exit(1); });
