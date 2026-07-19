const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying PayPer from:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "MON");

  const PayPer = await hre.ethers.getContractFactory("PayPer");
  const payper = await PayPer.deploy();
  await payper.waitForDeployment();

  const addr = await payper.getAddress();
  console.log("PayPer deployed at:", addr);
  console.log("Explorer:", `https://testnet.monadexplorer.com/address/${addr}`);

  // Save address for frontend
  const fs = require("fs");
  fs.writeFileSync(
    "./frontend/src/contract-address.json",
    JSON.stringify({ PayPer: addr }, null, 2)
  );
  console.log("Wrote frontend/src/contract-address.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
