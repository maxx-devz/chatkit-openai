import styles from './internal-user-dashboard.module.css';

// The OAuth form contains no credential input. The legacy PAT form remains available during migration.
export default function HubstaffConnection({ connected, oauthConfigured }) {
  return <div className={styles.connectionForm}>
    <h3>{connected ? 'Reconnect your Hubstaff account' : 'Connect your Hubstaff account'}</h3>
    {oauthConfigured ? <>
      <p>Sign in with the Hubstaff account approved for your portal profile. You will return here after granting read access.</p>
      <form action="/api/internal/hubstaff/oauth/start" method="post">
        <button type="submit">{connected ? 'Reconnect with Hubstaff sign-in' : 'Connect with Hubstaff'}</button>
      </form>
      <small>Your Hubstaff password is entered on Hubstaff, not in this portal.</small>
    </> : <p>Hubstaff sign-in is not configured in this environment yet. You can {connected ? 'reconnect' : 'connect'} with a personal token below.</p>}
    {connected && <p>Your current connection stays active unless the new connection succeeds.</p>}
    <details open={!oauthConfigured}>
      <summary>{connected ? 'Reconnect with a personal token instead' : 'Use a personal access token instead'}</summary>
      <p>Paste a personal token with hubstaff:read and tasks:read scopes. It must belong to your approved account.</p>
      <form action="/api/internal/connection" method="post" autoComplete="off">
        <label htmlFor="internal-user-hubstaff-token">Personal access token</label>
        <input id="internal-user-hubstaff-token" type="password" name="token" autoComplete="off" required minLength={20} maxLength={4096} spellCheck="false" />
        <button type="submit">{connected ? 'Validate and reconnect' : 'Validate and connect'}</button>
      </form>
      <small>The server encrypts your token and renews the connection automatically.</small>
    </details>
    {connected && <details className={styles.unlinkConnection}>
      <summary>Unlink Hubstaff</summary>
      <p>This removes your saved personal Hubstaff connection from the portal and stops My Work sync. Your portal account and approved Hubstaff user mapping remain, so you can reconnect later.</p>
      <form action="/api/internal/connection/unlink" method="post">
        <button className={styles.unlinkButton} type="submit">Unlink my Hubstaff account</button>
      </form>
      <small>This does not revoke the app&apos;s authorization in Hubstaff. Team and HR organization data are unaffected.</small>
    </details>}
  </div>;
}
