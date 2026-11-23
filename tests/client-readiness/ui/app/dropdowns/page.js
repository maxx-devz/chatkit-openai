import theme from '../../../../../components/portal-ui/portal-theme.module.css';
import fields from '../../../../../components/credits/credits.module.css';

// Isolated browser fixture. Uses the production CSS; no database or providers.
export default function Page() {
  return <main className={theme.surface + ' ' + fields.page} style={{maxWidth:680,margin:'24px auto',padding:20}}>
    <h1>Portal dropdown verification</h1>
    <form action="/dropdowns" method="get" style={{display:'grid',gap:18}}>
      <label htmlFor="workspace">Client account</label>
      <select id="workspace" name="workspace" defaultValue="alpha" required>
        <option value="">Choose a client</option>
        <option value="alpha">Alpha Client</option><option value="beta">Beta Client</option>
        <option value="paused" disabled>Paused client — unavailable</option>
      </select>
      <label htmlFor="resource">Report</label>
      <select id="resource" name="report" defaultValue="0">
        {Array.from({length:60},(_,i)=><option key={i} value={i}>Report {String(i+1).padStart(2,'0')} — Approved website findings and recommendations for the fictional client</option>)}
      </select>
      <label htmlFor="unavailable">Connection</label>
      <select id="unavailable" disabled defaultValue="none"><option value="none">Not connected</option></select>
      <fieldset disabled><legend>Unavailable settings</legend><label htmlFor="provider">Provider</label><select id="provider" defaultValue="none"><option value="none">No provider configured</option></select></fieldset>
      <div style={{display:'flex',gap:12}}><button type="submit">Apply selection</button><button type="reset">Reset selection</button></div>
    </form>
    <div style={{height:50,overflow:'hidden',marginTop:24,border:'1px solid #b7cfe4',padding:3}}>
      <label htmlFor="clipped">Inside a clipped card</label><select id="clipped" defaultValue="a"><option value="a">First option</option><option value="b">Second option</option><option value="c">Third option</option></select>
    </div>
    <button style={{marginTop:200}} type="button">Outside picker</button>
  </main>;
}
