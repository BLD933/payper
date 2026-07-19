// Natural-paced demo using screenshots stitched by ffmpeg.
const { chromium } = require("playwright");
const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const RPC = "https://testnet-rpc.monad.xyz";
const C = "0x68f6756c45C57619dF80618a0872F5D5DD289Bd8";
const PK = process.env.PRIVATE_KEY;
if (!PK) throw new Error("missing PRIVATE_KEY in .env");

const wallet = new ethers.Wallet(PK, new ethers.JsonRpcProvider(RPC));
const APP = "https://bld933.github.io/payper/";
const ABI = [
  "function createResource(uint256 price, bytes32 contentHash, string uri) external returns (uint256 id)",
  "function payForAccess(uint256 id) external payable returns (bool)",
  "function hasAccess(uint256 id, address who) external view returns (bool)",
  "function resources(uint256 id) external view returns (address creator, uint256 price, bytes32 contentHash, string uri, bool active, uint256 totalEarned, uint256 accessCount)",
  "event ResourceCreated(uint256 indexed id, address indexed creator, uint256 price, bytes32 contentHash, string uri)",
];
const contract = new ethers.Contract(C, ABI, wallet);
const BUYER = "0x68CB16eA2F62AC71b3A65Ed4134788a45C6Cc7C0";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function humanType(page, text, opts = {}) {
  const { baseDelay = 35, jitter = 30 } = opts;
  for (const c of text) {
    await page.keyboard.insertText(c);
    await sleep(baseDelay + Math.random() * jitter);
  }
}

async function encryptContent(plaintext, h) {
  const { subtle } = require("crypto");
  const keyBytes = ethers.getBytes(h).slice(0, 32);
  const iv = ethers.randomBytes(12);
  const aesKey = await subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, true, ["encrypt"]);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv: Buffer.from(iv) }, aesKey, Buffer.from(plaintext));
  return "enc:" + Buffer.concat([Buffer.from(iv), Buffer.from(ct)]).toString("base64");
}

async function createOnChain(content) {
  const h = ethers.keccak256(ethers.toUtf8Bytes(content));
  const ct = await encryptContent(content, h);
  const tx = await contract.createResource(ethers.parseEther("0.01"), h, ct);
  const r = await tx.wait();
  const ev = r.logs.map(l => { try { return contract.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === "ResourceCreated");
  return ev.args.id.toString();
}

async function main() {
  // Pre-create resources
  const ridA = await createOnChain("This is gated content. Pay to unlock it on Monad Testnet.");
  console.log("unpaid resource #" + ridA);
  const contentB = "Congratulations! You've unlocked exclusive trading alpha. The market moves in cycles. Accumulate during fear, distribute during greed. Always manage risk.";
  const ridB = await createOnChain(contentB);
  await contract.payForAccess(ridB, { value: ethers.parseEther("0.01") });
  console.log("pre-paid resource #" + ridB + ", hasAccess:", await contract.hasAccess(ridB, wallet.address));

  // Browser
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await ctx.newPage();

  // Mock wallet
  await page.addInitScript(() => {
    async function rpc(m, p) {
      const r = await fetch("https://testnet-rpc.monad.xyz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then(x => x.json());
      if (r.error) throw new Error(r.error.message); return r.result;
    }
    const ADDR = "0x68CB16eA2F62AC71b3A65Ed4134788a45C6Cc7C0";
    window.ethereum = {
      isMetaMask: true, selectedAddress: ADDR, chainId: "0x279f", networkVersion: "10143",
      _listeners: {}, on: function(ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); },
      removeListener: function(ev, cb) { if (!this._listeners[ev]) return; this._listeners[ev] = this._listeners[ev].filter(l => l !== cb); },
      request: async ({ method, params }) => {
        switch (method) {
          case "eth_requestAccounts": case "eth_accounts": return [ADDR];
          case "eth_chainId": return "0x279f"; case "eth_coinbase": return ADDR; case "net_version": return "10143";
          case "eth_getBalance": case "eth_call": case "eth_blockNumber": case "eth_gasPrice": case "eth_estimateGas":
          case "eth_getTransactionCount": case "eth_getTransactionReceipt": case "eth_getLogs": return rpc(method, params);
          default: throw new Error("unhandled: " + method);
        }
      },
    };
  });

  const screenshots = [];
  const cap = async (name, delay = 0) => {
    await sleep(delay);
    await page.screenshot({ path: `/tmp/demo-${name}.png`, fullPage: false });
    screenshots.push({ name, dur: 3.0 }); // seconds
    console.log("  captured: " + name);
  };

  // ===== SCENE 1: LANDING + CREATE FORM =====
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForSelector("h2", { timeout: 10000 });
  await sleep(1000);
  await cap("01-create-form-idle");

  // Type title
  const titleEl = page.locator("input[placeholder*='secret trading']");
  await titleEl.click();
  await sleep(300);
  await humanType(page, "Exclusive Trading Strategy", { baseDelay: 50, jitter: 40 });
  await cap("02-create-title-filled");

  // Type content
  const contentEl = page.locator("textarea[placeholder*='paste the content']");
  await contentEl.click();
  await sleep(300);
  await humanType(page, "My proprietary trading strategy:\n\n1. Buy the rumor, sell the news\n2. Always set stop losses\n3. Let winners run, cut losers short\n4. Trend is your friend until it bends\n\nDiscipline beats conviction.", { baseDelay: 20, jitter: 15 });
  await cap("03-create-form-filled");

  // Hover publish button
  await page.locator("button.primary").hover();
  await sleep(800);
  await cap("04-publish-button-hover");

  // ===== SCENE 2: PAYWALL CARD =====
  await page.goto(APP + "?id=" + ridA, { waitUntil: "networkidle" });
  await sleep(3000);
  await cap("05-paywall-card");

  // ===== SCENE 3: UNLOCKED CONTENT =====
  await page.goto(APP + "?id=" + ridB, { waitUntil: "networkidle" });
  await sleep(4000);
  await cap("06-unlocked-revealed");

  // Scroll through content
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 200));
    await sleep(300);
  }
  await sleep(1500);
  await cap("07-scrolled-content");

  await page.screenshot({ path: "/tmp/demo-final.png", fullPage: true });
  await ctx.close();
  await browser.close();

  // ===== STITCH WITH FFMPEG =====
  const fs = require("fs");
  const path = require("path");
  const demoSave = path.resolve(path.join(__dirname, "..", "demo"));
  const { execSync } = require("child_process");

  // Create ffmpeg concat script
  let filter = "";
  const inputs = screenshots.map((s, i) => {
    const src = `/tmp/demo-${s.name}.png`;
    if (!fs.existsSync(src)) throw new Error("missing screenshot: " + src);
    return src;
  });

  // Use ffmpeg to create video from images with per-image durations
  // Build complex filter: loop each image for its duration, then concat
  let ffmpegCmd = `ffmpeg -y -framerate 30`;
  for (const s of screenshots) {
    ffmpegCmd += ` -loop 1 -i /tmp/demo-${s.name}.png`;
  }
  // Build concat filter
  const parts = screenshots.map((s, i) => `[${i}:v]setpts=PTS-STARTPTS,trim=duration=${s.dur}[v${i}]`).join(";\n");
  const concat = screenshots.map((_, i) => `[v${i}]`).join("");
  ffmpegCmd += ` -filter_complex "${parts}; ${concat}concat=n=${screenshots.length}:v=1:a=0,format=yuv420p,fps=12[v]" -map "[v]" -c:v libvpx -b:v 1M -crf 10 -auto-alt-ref 0 "${demoSave}/payper-demo.webm"`;

  console.log("stitching video...");
  console.log(ffmpegCmd.substring(0, 200) + "...");
  execSync(ffmpegCmd, { stdio: "pipe" });
  const stat = fs.statSync(path.join(demoSave, "payper-demo.mp4"));
  console.log("video saved: " + path.join(demoSave, "payper-demo.mp4"));
  console.log("size: " + (stat.size / 1024 / 1024).toFixed(1) + "MB");

  // Cleanup screenshots
  for (const s of screenshots) {
    try { fs.unlinkSync(`/tmp/demo-${s.name}.png`); } catch {}
  }
  try { fs.unlinkSync("/tmp/demo-final.png"); } catch {}
}

main().catch(e => { console.error(e); process.exit(1); });