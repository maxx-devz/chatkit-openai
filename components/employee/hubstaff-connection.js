import styles from './employee-dashboard.module.css';

// Server-rendered native form: the token is never read into React state or handled by frontend JavaScript.
export default function HubstaffConnection({ connected }) {
  return <details className={styles.connectionForm} open={!connected}>
    <summary>{connected ? 'Update Hubstaff connection' : 'Connect your Hubstaff account'}</summary>
    <p>Use a current personal access token with Hubstaff and Tasks read access. It must match the account approved by AOC. Initial PAT refresh tokens and organization tokens are not supported.</p>
    <form action="/api/employee/connection" method="post" autoComplete="off">
      <label htmlFor="employee-hubstaff-token">Personal access token</label>
      <input id="employee-hubstaff-token" type="password" name="token" autoComplete="off" required minLength={20} maxLength={4096} spellCheck="false" />
      <button type="submit">Validate and connect</button>
    </form>
    <small>The server validates and encrypts your token. When it expires, reconnect with a current access token.</small>
  </details>;
}
