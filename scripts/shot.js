const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
  await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "/tmp/preview-create.png" });
  await p.goto("http://localhost:4173/?id=1", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: "/tmp/preview-access.png" });
  await b.close();
  console.log("shots done");
})();
