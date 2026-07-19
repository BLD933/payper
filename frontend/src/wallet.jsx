import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainOk, setChainOk] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    try {
      if (!window.ethereum) {
        setError("No wallet found. Install MetaMask.");
        return;
      }
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const sig = await prov.getSigner();
      const net = await prov.getNetwork();
      setProvider(prov);
      setSigner(sig);
      setAccount(accts[0]);
      setChainOk(net.chainId === 10143n);
      setError(null);
    } catch (e) {
      setError(e.message || "connect failed");
    }
  }, []);

  const switchToMonad = useCallback(async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x279f" }],
      });
      setChainOk(true);
    } catch (e) {
      // chain not added yet
      if (e.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x279f",
            chainName: "Monad Testnet",
            nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
            rpcUrls: ["https://testnet-rpc.monad.xyz"],
            blockExplorerUrls: ["https://testnet.monadexplorer.com"],
          }],
        });
        setChainOk(true);
      }
    }
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on?.("accountsChanged", (a) => setAccount(a[0] || null));
      window.ethereum.on?.("chainChanged", () => window.location.reload());
    }
  }, []);

  return (
    <WalletContext.Provider value={{ account, provider, signer, chainOk, error, connect, switchToMonad, setError }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
