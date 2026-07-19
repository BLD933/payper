const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
  await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const createText = await p.locator("body").innerText();
  await p.goto("http://localhost:4173/?id=1", { waitUntil: "networkidle" });
  await p.waitForTimeout(1000);
  const accessText = await p.locator("body").innerText();
  console.log("=== CREATE VIEW TEXT ===\n" + createText.slice(0, 400));
  console.log("\n=== ACCESS VIEW TEXT ===\n" + accessText.slice(0, 400));
  await b.close();
})();
