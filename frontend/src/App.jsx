import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { PAYPER_ABI, hashContent } from "./abi.js";
import { encryptContent, decryptContent } from "./crypto.js";
import { useWallet } from "./wallet.jsx";
import contractAddr from "./contract-address.json";

const CONTRACT = contractAddr.PayPer;
const SHORT = (a) => (!a ? "—" : a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a);

export default function App() {
  const { account, signer, provider, chainOk, error, connect, switchToMonad, setError } = useWallet();
  const [tab, setTab] = useState(() =>
    new URLSearchParams(window.location.search).get("id") ? "access" : "create"
  );

  return (
    <div className="app">
      <header className="hdr">
        <div className="brand" onClick={() => setTab("create")}>
          <span className="logo">⚡</span> PayPer <span className="tag">MONAD</span>
        </div>
        <nav>
          <button className={tab === "create" ? "nav active" : "nav"} onClick={() => setTab("create")}>create</button>
          <button className={tab === "access" ? "nav active" : "nav"} onClick={() => setTab("access")}>access</button>
        </nav>
        <WalletBadge account={account} chainOk={chainOk} error={error} onConnect={connect} onSwitch={switchToMonad} />
      </header>

      <main>
        {tab === "create" ? (
          <CreateView signer={signer} account={account} chainOk={chainOk} error={error} setError={setError} />
        ) : (
          <AccessView provider={provider} signer={signer} account={account} chainOk={chainOk} error={error} setError={setError} />
        )}
      </main>

      <footer className="ftr">
        PayPer · x402 pay-per-use on <a href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer">Monad Testnet</a> · {SHORT(CONTRACT)}
      </footer>
    </div>
  );
}

function WalletBadge({ account, chainOk, error, onConnect, onSwitch }) {
  if (!account) return <button className="conn" onClick={onConnect}>Connect Wallet</button>;
  return (
    <div className="wbadge">
      <span className="addr">{SHORT(account)}</span>
      {chainOk ? <span className="chain ok">monad ✓</span> : <button className="chain bad" onClick={onSwitch}>switch</button>}
    </div>
  );
}

function ErrorLine({ msg }) {
  if (!msg) return null;
  return <p className="errline">⚠ {msg}</p>;
}

function CreateView({ signer, account, chainOk, error, setError }) {
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
      const ciphertext = await encryptContent(content, h); // on-chain delivery, no server
      const priceWei = ethers.parseEther(price);
      const contract = new ethers.Contract(CONTRACT, PAYPER_ABI, signer);
      const tx = await contract.createResource(priceWei, h, "enc:" + ciphertext);
      const receipt = await tx.wait();
      const ev = receipt.logs.map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "ResourceCreated");
      const id = ev ? ev.args.id.toString() : "?";
      const dir = window.location.pathname.endsWith("/")
        ? window.location.pathname
        : window.location.pathname.slice(0, window.location.pathname.lastIndexOf("/") + 1);
      const link = `${window.location.origin}${dir}?id=${id}`;
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
        <div className="success-banner">
          <span className="ico">✓</span>
          <div>
            <b>resource #{result.id} published</b>
            <div style={{ color: "var(--text-mute)", fontSize: 12.5, fontFamily: "var(--mono)", marginTop: 2 }}>
              tx {SHORT(result.tx)} · gated on Monad
            </div>
          </div>
        </div>
        <PaymentRail creator={account} price={price} paid={false} />
        <label>shareable unlock link</label>
        <div className="row">
          <input readOnly value={result.link} />
          <button className="ghost" style={{ margin: 0, width: "auto" }} onClick={() => navigator.clipboard.writeText(result.link)}>copy</button>
        </div>
        <p className="muted">content hash <code>{SHORT(result.hash)}</code> · released only after payment</p>
        <button className="ghost" onClick={() => setResult(null)}>create another</button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>monetize anything</h2>
      <p className="muted">A prompt, a file, a guide, a tool. Set a price in MON. Share the link. They pay, it unlocks — non-custodial, on-chain.</p>
      <label>title</label>
      <input placeholder="e.g. my secret trading prompt" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label>gated content</label>
      <textarea placeholder="paste the content buyers will unlock…" value={content} onChange={(e) => setContent(e.target.value)} />
      <label>price (MON)</label>
      <input type="number" step="0.001" min="0.001" value={price} onChange={(e) => setPrice(e.target.value)} />
      <button className="primary" disabled={busy} onClick={handleCreate}>
        {busy ? (<><span className="spinner" /> publishing onchain…</>) : `publish for ${price} MON`}
      </button>
      <ErrorLine msg={error} />
    </section>
  );
}

function AccessView({ provider, signer, account, chainOk, error, setError }) {
  const [id, setId] = useState(new URLSearchParams(window.location.search).get("id") || "");
  const [info, setInfo] = useState(null);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | pending | confirming | success | error
  const [revealed, setRevealed] = useState(null);

  async function loadInfo() {
    setError(null);
    if (!provider || !id) return;
    try {
      const c = new ethers.Contract(CONTRACT, PAYPER_ABI, provider);
      const r = await c.resources(id);
      if (r.creator === "0x0000000000000000000000000000000000000000") {
        setError("No resource with that ID."); setInfo(null); return;
      }
      const infoData = {
        creator: r.creator, price: ethers.formatEther(r.price),
        active: r.active, accessCount: r.accessCount.toString(),
        contentHash: r.contentHash, uri: r.uri,
      };
      setInfo(infoData);
      const owned = account ? await c.hasAccess(id, account) : false;
      setHas(owned);
      if (owned) reveal(infoData, id, account); // pass freshly-fetched data, avoids stale closure
    } catch (e) { setError(e.reason || e.message || "load failed"); }
  }

  useEffect(() => { if (provider && id) loadInfo(); }, [provider, id, account]);

  async function pay() {
    setError(null);
    if (!signer) { setError("Connect your wallet."); return; }
    if (!chainOk) { setError("Switch to Monad Testnet."); return; }
    setStatus("pending");
    setBusy(true);
    try {
      const c = new ethers.Contract(CONTRACT, PAYPER_ABI, signer);
      const priceWei = (await c.resources(id)).price;
      const tx = await c.payForAccess(id, { value: priceWei });
      setStatus("confirming");
      await tx.wait();
      setHas(true);
      setStatus("success");
      await reveal();
    } catch (e) {
      setStatus("error");
      setError(e.reason || e.message || "pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function reveal(i, rid, acc) {
    const ii = i || info;
    const rid2 = rid || id;
    const acc2 = acc || account;
    if (!ii?.uri || !ii?.uri.startsWith("enc:")) {
      setRevealed("(no on-chain content for this resource)");
      return;
    }
    // verify access authoritatively on-chain (avoids stale closure state)
    try {
      const c = new ethers.Contract(CONTRACT, PAYPER_ABI, provider || signer);
      const allowed = acc2 ? await c.hasAccess(rid2, acc2) : false;
      if (!allowed) { setRevealed("Payment required to decrypt."); return; }
    } catch (e) { setRevealed("(could not verify access on-chain)"); return; }
    try {
      const ciphertext = ii.uri.slice(4); // strip "enc:"
      const plain = await decryptContent(ciphertext, ii.contentHash);
      setRevealed(plain);
    } catch (e) {
      setRevealed("(decryption failed — content may be corrupt)");
    }
  }

  if (!id) {
    return (
      <section className="card">
        <h2>unlock a resource</h2>
        <label>resource id from your link</label>
        <div className="row">
          <input placeholder="e.g. 1" value={id} onChange={(e) => setId(e.target.value)} />
          <button className="ghost" style={{ margin: 0, width: "auto" }} onClick={loadInfo}>load</button>
        </div>
        <ErrorLine msg={error} />
      </section>
    );
  }

  const statusBadge = {
    idle: null,
    pending: { cls: "pending", label: "Awaiting wallet…" },
    confirming: { cls: "pending", label: "Confirming on-chain…" },
    success: { cls: "success", label: "Paid" },
    error: { cls: "error", label: "Failed" },
  }[status];

  return (
    <section className="card">
      <h2>resource #{id}</h2>
      {info && (
        <div className="meta">
          <div><span>price</span><b>{info.price} MON</b></div>
          <div><span>creator</span><b>{SHORT(info.creator)}</b></div>
          <div><span>unlocks</span><b>{info.accessCount}</b></div>
          <div><span>status</span><b>{info.active ? "live" : "closed"}</b></div>
        </div>
      )}

      {has ? (
        <div className="unlocked">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span className="badge success"><span className="dot" /> unlocked</span>
            <span className="muted" style={{ fontSize: 12.5 }}>released to your wallet only</span>
          </div>
          <pre className="content">{revealed || "loading…"}</pre>
        </div>
      ) : (
        <div className="paywall-card">
          <div className="paywall-head">
            <div className="paywall-icon">🔒</div>
            <div>
              <h3>Locked content</h3>
              <p>one-time payment · instant unlock</p>
            </div>
          </div>
          <div className="paywall-body">
            <div className="pay-details">
              <div className="row"><span className="k">amount</span><span className="v amt">{info?.price || "—"} MON</span></div>
              <div className="row"><span className="k">network</span><span className="v">Monad Testnet</span></div>
              <div className="row"><span className="k">creator</span><span className="v">{SHORT(info?.creator)}</span></div>
              <div className="row"><span className="k">method</span><span className="v">on-chain · non-custodial</span></div>
            </div>
            {info && <PaymentRail creator={info.creator} price={info.price} paid={false} />}
            <button className="primary" disabled={busy || !info?.active} onClick={pay}>
              {busy ? (<><span className="spinner" /> {status === "confirming" ? "confirming payment…" : "processing…"}</>) : `pay ${info?.price || ""} MON to unlock`}
            </button>
            {statusBadge && <div style={{ marginTop: 12 }}><span className={`badge ${statusBadge.cls}`}><span className="dot" /> {statusBadge.label}</span></div>}
            {!info?.active && <p className="status-closed">this resource is closed by its creator.</p>}
            <div className="notice">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <span>Payment goes directly to the creator's wallet. PayPer never holds your funds — access is enforced by the smart contract.</span>
            </div>
          </div>
        </div>
      )}
      <ErrorLine msg={error} />
    </section>
  );
}

function PaymentRail({ creator, price, paid }) {
  return (
    <div className="rail">
      <div className="rhead">payment rail · monad testnet</div>
      <div className="flow">
        <span className="node buyer">you</span>
        <span className="arrow"><span className="pulse" />──▶</span>
        <span className="node"><span className="amt">{price} MON</span></span>
        <span className="arrow">──▶</span>
        <span className="node creator">{SHORT(creator)}</span>
      </div>
    </div>
  );
}
