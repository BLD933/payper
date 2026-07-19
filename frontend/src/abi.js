// Minimal ABI for the PayPer contract (only what the frontend uses)
export const PAYPER_ABI = [
  "function createResource(uint256 price, bytes32 contentHash, string uri) external returns (uint256 id)",
  "function payForAccess(uint256 id) external payable returns (bool)",
  "function hasAccess(uint256 id, address who) external view returns (bool)",
  "function resources(uint256 id) external view returns (address creator, uint256 price, bytes32 contentHash, string uri, bool active, uint256 totalEarned, uint256 accessCount)",
  "function deactivate(uint256 id) external",
  "event ResourceCreated(uint256 indexed id, address indexed creator, uint256 price, bytes32 contentHash, string uri)",
  "event AccessPaid(uint256 indexed id, address indexed payer, uint256 amount, uint256 accessCount)"
];

export const MONAD_TESTNET = {
  chainId: "0x279f", // 10143
  chainName: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
};

// keccak256 of a string, returns 0x-prefixed hex (used as contentHash)
export async function hashContent(text) {
  const { ethers } = await import("ethers");
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}
