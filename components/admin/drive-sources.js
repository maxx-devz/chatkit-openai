"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DriveSourceAiTest from "./drive-source-ai-test";
import PreparedSourceSettings from "./prepared-source-settings";
import styles from "./drive-sources.module.css";

const results = {
  cancelled: "Google authorization was cancelled. Nothing was published.",
  wrong_account: "Use the configured Google account and grant read-only Drive access.",
  client_rejected: "Google rejected this app's OAuth client credentials. Correct this deployment's matching GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET, then reconnect. Keep the Drive encryption key unchanged. Existing source publication settings were not changed.",
  failed: "Google authorization could not finish. Check the client, callback URL, consent permissions and test-user settings, then reconnect.",
};

export default function DriveSources({embedded=false}) {
  const Container=embedded?"div":"main",Title=embedded?"h2":"h1";
  const [connection, setConnection] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [previewedVersions, setPreviewedVersions] = useState({});
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const actionInProgress = useRef(false);
  const connected = connection?.connected === true && connection?.accessVerified === true;

  const applyConnectionFailure = useCallback(payload => {
    if (["reconnect_required", "not_connected", "drive_token_unreadable", "google_client_rejected", "root_unavailable"].includes(payload.code)) {
      setMessage("");
      setConnection(previous => previous ? { ...previous, connected: false, accessVerified: false,
        state: payload.code, connectionMessage: payload.error } : previous);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/admin/source-connections", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Source connection status is unavailable.");
    return payload;
  }, []);

  useEffect(() => {
    let active = true;
    const status = new URLSearchParams(window.location.search).get("connection");
    loadStatus().then((payload) => { if (active) {
      setConnection(payload);
      if (status === "connected") setMessage(payload.connected === true && payload.accessVerified === true
        ? "Google Drive authorization and folder access verified."
        : "Google sign-in returned, but Drive access is not verified. Review the current connection status above.");
      else if (results[status]) setMessage(results[status]);
    } })
      .catch((failure) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setBusy(""); });
    return () => { active = false; };
  }, [loadStatus]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    let inFlight = false;
    let controller;
    const refresh = async () => {
      if (document.hidden || inFlight || actionInProgress.current) return;
      inFlight = true; controller = new AbortController(); setAutoRefreshing(true);
      try {
        const response = await fetch("/api/admin/source-connections", { method: "POST", cache: "no-store",
          signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discover" }) });
        const payload = await response.json();
        if (!response.ok) { if (active) applyConnectionFailure(payload); throw new Error(payload.error || "Automatic folder check failed."); }
        if (active) { setInventory(payload); setError(""); }
      } catch (failure) { if (active && !controller.signal.aborted) setError(failure.message); }
      finally { inFlight = false; if (active) setAutoRefreshing(false); }
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; controller?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [connected, applyConnectionFailure]);

  async function action(name, fileId) {
    if (busy) return;
    actionInProgress.current = true;
    setBusy(name); setError(""); setMessage("");
    if (name === "discover" || name === "disconnect" || name === "check") { setInventory(null); setPreview(null); setPreviewedVersions({}); }
    if (name === "check") setConnection(previous => previous ? {...previous,connected:false,accessVerified:false,state:"checking",connectionMessage:""} : previous);
    if (name === "preview") setPreview(null);
    try {
      if (name === "check") { setConnection(await loadStatus()); return; }
      const response = await fetch("/api/admin/source-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, fileId }) });
      const payload = await response.json();
      if (!response.ok) { if (name === "discover") applyConnectionFailure(payload); throw new Error(payload.error || "The source request could not finish."); }
      if (name === "connect") { window.location.assign(payload.authorizationUrl); return; }
      if (name === "discover") { setInventory(payload); setPage(0); }
      if (name === "preview") { setPreview(payload); setPreviewedVersions(previous => ({ ...previous, [payload.id]: String(payload.version) })); }
      if (name === "disconnect") { setMessage(payload.message); setConnection(await loadStatus()); }
    } catch (failure) {
      if (name === "check") setConnection(previous => previous ? {...previous,connected:false,accessVerified:false,state:"verification_failed",
        connectionMessage:"Current Drive access could not be verified. Check the connection again."} : previous);
      setError(failure.message);
    }
    finally { actionInProgress.current = false; setBusy(""); }
  }

  const files = (inventory?.files || []).filter((file) => file.path.toLowerCase().includes(query.toLowerCase()));
  const pageFiles = files.slice(page * 25, page * 25 + 25);
  return (
    <Container className={styles.page} data-admin-embedded={embedded || undefined}>
      <header className={styles.heading}>
        <div><Link href="/admin">← AOC Admin</Link><p className={styles.eyebrow}>COMPANY KNOWLEDGE · ADMIN MANAGED</p><Title>Company knowledge</Title>
          <p>Connect your company Drive once. Publish shared company knowledge for all clients; original documents stay in Drive.</p></div>
        <span className={styles.badge}>Audience-controlled source access</span>
      </header>
      <section className={styles.card} aria-labelledby="connection-heading">
        <h2 id="connection-heading">Google Drive · read only</h2>
        <p>You authorize Google as AOC Admin, not as each client. Credentials remain server-only. Publish the shared company pack below so all clients can ask questions without a Google login. Discovery and preview do not alter Drive sharing or send document content to AI; the private AI test remains separate.</p>
        {connection?.setupMessage && <p className={styles.notice}>{connection.setupMessage}</p>}
        {connection?.configured && <dl><dt>Authorized Google account</dt><dd>{connection.allowedEmail}</dd><dt>OAuth callback</dt><dd><code>{connection.redirectUri}</code></dd>
          <dt>Connection</dt><dd>{busy === "check" ? "Checking Google Drive access..." : connected ? "Connected as " + connection.email
            : connection.hasAuthorization ? "Saved authorization - access not verified" : "Not connected"}</dd>
          {connection.connectedAt && <><dt>Authorization saved</dt><dd>{new Date(connection.connectedAt).toLocaleString()}</dd></>}
        </dl>}
        {connection?.connectionMessage && <p className={styles.notice} role="status">{connection.connectionMessage}</p>}
        <div className={styles.actions}>
          <button disabled={Boolean(busy) || !connection?.configured} onClick={() => action("connect")}>{connection?.hasAuthorization ? "Reconnect Google Drive" : "Connect Google Drive"}</button>
          <button disabled={Boolean(busy) || !connection?.configured} onClick={() => action("check")}>Check connection</button>
          <button disabled={Boolean(busy) || !connected} onClick={() => action("discover")}>Discover / refresh sources</button>
          {connected && <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => {
            if (window.confirm("Disconnect this private Drive test and revoke its Google authorization?")) action("disconnect");
          }}>Disconnect</button>}
        </div>
        <p className={styles.small}>Google consent requests read-only Drive access, which Google does not limit to one folder. The server restricts this feature to the configured parent and eligible source descendants. Billing is managed separately in Google Cloud; this page never activates it.</p>
      </section>
      {busy && <p role="status" className={styles.notice}>{busy === "preview" ? "Reading the selected document…" : busy === "discover" ? "Checking accessible source folders and current file metadata…" : "Preparing connection…"}</p>}
      {autoRefreshing && connected && <p role="status" className={styles.notice}>Automatically checking parent-folder sources…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {message && <p role="status" className={styles.notice}>{message}</p>}
      <PreparedSourceSettings connected={connected} onPreview={fileId => action("preview", fileId)} />
      {inventory && <section className={styles.card} aria-labelledby="inventory-heading">
        <h2 id="inventory-heading">{inventory.rootName} · {inventory.files.length} source candidates</h2>
        <p>Metadata checked {new Date(inventory.checkedAt).toLocaleString()}. This list refreshes every minute while visible. The separate private test checks Drive on demand; normal client/admin chat uses only prepared, audience-approved data.</p>
        <p className={styles.small}>Archived, legacy, workspace and reference-only folders are excluded. Source placement alone is not approval. Google Docs, Google Sheets, DOCX and XLSX support text preparation; unsupported formats are reported explicitly.</p>
        <label className={styles.search}>Search sources<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Document or folder name" /></label>
        <ul className={styles.files}>{pageFiles.map((file) => <li key={file.id}>
          <div><strong>{file.name}</strong><span>{file.path}</span><small>{file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "No modification date"} · Audience approval managed above</small></div>
          <button className={styles.secondary} disabled={Boolean(busy) || !file.previewSupported} onClick={() => action("preview", file.id)}>Private preview</button>
        </li>)}</ul>
        {!files.length && <p>No matching source candidates.</p>}
        <div className={styles.actions}><button disabled={!page || Boolean(busy)} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(files.length / 25))}</span><button disabled={(page + 1) * 25 >= files.length || Boolean(busy)} onClick={() => setPage(page + 1)}>Next</button></div>
      </section>}
      {preview && <section className={styles.card} aria-labelledby="preview-heading"><div className={styles.heading}><h2 id="preview-heading">{preview.name}</h2><button className={styles.secondary} onClick={() => setPreview(null)}>Close preview</button></div>
        <p>{preview.characters.toLocaleString()} characters · Read directly from Google · Private preview only</p>
        <pre className={styles.preview}>{preview.text}</pre>
      </section>}
      {inventory && <DriveSourceAiTest files={inventory.files} rootName={inventory.rootName} previewedVersions={previewedVersions} sourceBusy={busy} onPreview={fileId => action("preview", fileId)} />}
    </Container>
  );
}
