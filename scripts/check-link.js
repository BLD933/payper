const { chromium } = require("playwright");
const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const RPC = "https://testnet-rpc.monad.xyz";
const APP = "https://bld933.github.io/payper/";
const ID = process.argv[2] || "11";

(async () => {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await context.addInitScript(({ addr, rpc }) => {
    const relay = async (method, params) => {
      const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params || [] }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
    };
    window.ethereum = { isMetaMask: true, chainId: "0x279f", selectedAddress: addr,
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [addr];
        if (method === "eth_chainId") return "0x279f";
        if (method === "wallet_switchEthereumChain") return null;
        return relay(method, params);
      }, on: () => {} };
  }, { addr: wallet.address, rpc: RPC });
  const page = await context.newPage();
  page.on("console", m => console.log("PAGE:", m.type(), m.text()));
  page.on("pageerror", e => console.log("PAGEERR:", e.message));
  await page.goto(APP + "?id=" + ID, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const txt = await page.locator("body").innerText();
  console.log("=== DOM at ?id=" + ID + " ===");
  console.log(txt);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
