// UI-only harness. No authentication, database, or real Hubstaff calls are made here.
import EmployeeDashboard from '../../../../components/employee/employee-dashboard';
import HubstaffConnection from '../../../../components/employee/hubstaff-connection';
import styles from '../../../../components/employee/employee-dashboard.module.css';
export default async function Page({ searchParams }) {
  const connected = (await searchParams).connected !== 'false';
  return <div className={styles.shell}>
    <header className={styles.header}><div className={styles.brand}><strong>AOC</strong><span>Employee Portal</span></div><span>Fixture Employee</span></header>
    <EmployeeDashboard name="Fixture Employee" connected={connected}>
      <HubstaffConnection connected={connected} />
    </EmployeeDashboard>
  </div>;
}
