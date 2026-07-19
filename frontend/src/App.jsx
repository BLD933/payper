import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { PAYPER_ABI, MONAD_TESTNET, hashContent } from "./abi.js";
import { useWallet } from "./wallet.jsx";
import contractAddr from "./contract-address.json";

const CONTRACT = contractAddr.PayPer;

export default function App() {
  const { account, signer, provider, chainOk, error, connect, switchToMonad, setError } = useWallet();
  const [tab, setTab] = useState("create"); // create | access

  return (
    <div className="app">
      <header className="hdr">
        <div className="brand" onClick={() => setTab("create")}>
          <span className="logo">⚡</span> PayPer
        </div>
        <nav>
          <button className={tab === "create" ? "nav active" : "nav"} onClick={() => setTab("create")}>Create</button>
          <button className={tab === "access" ? "nav active" : "nav"} onClick={() => setTab("access")}>Access</button>
        </nav>
        <WalletBadge
          account={account}
          chainOk={chainOk}
          error={error}
          onConnect={connect}
          onSwitch={switchToMonad}
        />
      </header>

      <main>
        {tab === "create" ? (
          <CreateView signer={signer} account={account} chainOk={chainOk} setError={setError} />
        ) : (
          <AccessView provider={provider} signer={signer} account={account} chainOk={chainOk} setError={setError} />
        )}
      </main>

      <footer className="ftr">
        PayPer · x402-style pay-per-use on <a href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer">Monad Testnet</a> · contract {shorten(CONTRACT)}
      </footer>
    </div>
  );
}

function WalletBadge({ account, chainOk, error, onConnect, onSwitch }) {
  if (!account) {
    return <button className="conn" onClick={onConnect}>Connect Wallet</button>;
  }
  return (
    <div className="wbadge">
      <span className="addr">{shorten(account)}</span>
      {chainOk ? (
        <span className="chain ok">Monad ✓</span>
      ) : (
        <button className="chain bad" onClick={onSwitch}>Switch to Monad</button>
      )}
    </div>
  );
}

function CreateView({ signer, account, chainOk, setError }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [price, setPrice] = useState("0.01");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleCreate() {
    setError(null);
    if (!signer) { setError("Connect your wallet first."); return; }
    if (!chainOk) { setError("Switch to Monad Testnet."); return; }
    if (!title || !content) { setError("Title and content are required."); return; }
    setBusy(true);
    try {
      const h = await hashContent(content);
      const priceWei = ethers.parseEther(price);
      const contract = new ethers.Contract(CONTRACT, PAYPER_ABI, signer);
      const tx = await contract.createResource(priceWei, h, "inline://" + title);
      const receipt = await tx.wait();
      // find resource id from event
      const ev = receipt.logs
        .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "ResourceCreated");
      const id = ev ? ev.args.id.toString() : "?";
      const link = `${window.location.origin}/?id=${id}`;
      // persist gated content off-chain, released only after on-chain payment
      try {
        await fetch(`${import.meta.env.VITE_API || ""}/api/resource`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, title, content, creator: account }),
        });
      } catch (e) { /* server optional in demo */ }
      setResult({ id, link, tx: receipt.hash, hash: h });
    } catch (e) {
      setError(e.reason || e.message || "create failed");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section className="card">
        <h2>🎉 Resource published</h2>
        <p>Resource #{result.id}</p>
        <label>Shareable unlock link</label>
        <div className="row">
          <input readOnly value={result.link} />
          <button onClick={() => navigator.clipboard.writeText(result.link)}>Copy</button>
        </div>
        <p className="muted">Content hash: <code>{shorten(result.hash)}</code></p>
        <p className="muted">Tx: <a href={`${MONAD_TESTNET.blockExplorerUrls[0]}/tx/${result.tx}`} target="_blank" rel="noreferrer">{shorten(result.tx)}</a></p>
        <button className="ghost" onClick={() => setResult(null)}>Create another</button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Create a paid resource</h2>
      <p className="muted">Monetize anything — a prompt, a file, a tool, a guide. Set a price in MON. Share the link. They pay, they unlock.</p>
      <label>Title</label>
      <input placeholder="e.g. My secret trading prompt" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label>Gated content</label>
      <textarea rows={6} placeholder="Paste the content buyers will unlock..." value={content} onChange={(e) => setContent(e.target.value)} />
      <label>Price (MON)</label>
      <input type="number" step="0.001" min="0.001" value={price} onChange={(e) => setPrice(e.target.value)} />
      <button className="primary" disabled={busy} onClick={handleCreate}>
        {busy ? "Publishing onchain…" : `Publish for ${price} MON`}
      </button>
    </section>
  );
}

function AccessView({ provider, signer, account, chainOk, setError }) {
  const [id, setId] = useState(new URLSearchParams(window.location.search).get("id") || "");
  const [info, setInfo] = useState(null);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(null);

  async function loadInfo() {
    setError(null);
    if (!provider || !id) return;
    try {
      const c = new ethers.Contract(CONTRACT, PAYPER_ABI, provider);
      const r = await c.resources(id);
      if (r.creator === "0x0000000000000000000000000000000000000000") {
        setError("No resource with that ID.");
        setInfo(null);
        return;
      }
      setInfo({
        creator: r.creator,
        price: ethers.formatEther(r.price),
        active: r.active,
        accessCount: r.accessCount.toString(),
        totalEarned: ethers.formatEther(r.totalEarned),
      });
      if (account) {
        const ok = await c.hasAccess(id, account);
        setHas(ok);
      }
    } catch (e) {
      setError(e.reason || e.message || "load failed");
    }
  }

  useEffect(() => { if (provider && id) loadInfo(); }, [provider, id, account]);

  async function pay() {
    setError(null);
    if (!signer) { setError("Connect your wallet."); return; }
    if (!chainOk) { setError("Switch to Monad Testnet."); return; }
    setBusy(true);
    try {
      const c = new ethers.Contract(CONTRACT, PAYPER_ABI, signer);
      const priceWei = (await c.resources(id)).price;
      const tx = await c.payForAccess(id, { value: priceWei });
      await tx.wait();
      setHas(true);
      // reveal content by fetching from a simple off-chain store keyed by contentHash
      await reveal();
    } catch (e) {
      setError(e.reason || e.message || "pay failed");
    } finally {
      setBusy(false);
    }
  }

  // Fetch gated content from the off-chain store, which releases it only
  // after verifying on-chain payment (hasAccess returns true).
  async function reveal() {
    try {
      const r = await fetch(`${import.meta.env.VITE_API || ""}/api/resource/${id}?buyer=${account}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setRevealed(j.error === "not paid" ? "Payment not yet confirmed on-chain. Try again in a moment." : "(content unavailable)");
        return;
      }
      const j = await r.json();
      setRevealed(j.content);
    } catch (e) {
      setRevealed("(content store unreachable — run `npm run server`)");
    }
  }

  if (!id) {
    return (
      <section className="card">
        <h2>Unlock a resource</h2>
        <label>Paste the resource ID from your link</label>
        <div className="row">
          <input placeholder="e.g. 1" value={id} onChange={(e) => setId(e.target.value)} />
          <button onClick={loadInfo}>Load</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Resource #{id}</h2>
      {info && (
        <div className="meta">
          <div><span>Price</span><b>{info.price} MON</b></div>
          <div><span>Creator</span><b>{shorten(info.creator)}</b></div>
          <div><span>Unlocks</span><b>{info.accessCount}</b></div>
          <div><span>Status</span><b>{info.active ? "live" : "closed"}</b></div>
        </div>
      )}
      {has ? (
        <div className="unlocked">
          <h3>✅ Unlocked</h3>
          <pre className="content">{revealed || "loading…"}</pre>
        </div>
      ) : (
        <div className="paywall">
          <p>This content is gated. Pay <b>{info?.price} MON</b> to unlock instantly — on-chain, non-custodial.</p>
          <button className="primary" disabled={busy || !info?.active} onClick={pay}>
            {busy ? "Confirming payment…" : `Pay ${info?.price || ""} MON to unlock`}
          </button>
          {!info?.active && <p className="muted">This resource is closed by its creator.</p>}
        </div>
      )}
    </section>
  );
}

function shorten(a) {
  if (!a) return "—";
  return a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
}
