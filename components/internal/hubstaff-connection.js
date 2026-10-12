import styles from './internal-user-dashboard.module.css';

// Server-rendered native form: the token is never read into React state or handled by frontend JavaScript.
export default function HubstaffConnection({ connected }) {
  return <details className={styles.connectionForm} open={!connected}>
    <summary>{connected ? 'Update Hubstaff connection' : 'Connect your Hubstaff account'}</summary>
    <p>Paste the token Hubstaff shows when you create a personal access token with hubstaff:read and tasks:read scopes. It must belong to the account approved by AOC.</p>
    <form action="/api/internal/connection" method="post" autoComplete="off">
      <label htmlFor="internal-user-hubstaff-token">Personal access token</label>
      <input id="internal-user-hubstaff-token" type="password" name="token" autoComplete="off" required minLength={20} maxLength={4096} spellCheck="false" />
      <button type="submit">Validate and connect</button>
    </form>
    <small>The server exchanges and encrypts your token, then renews your connection automatically.</small>
  </details>;
}
