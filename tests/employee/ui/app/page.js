// UI-only harness. No authentication, database, or real Hubstaff calls are made here.
import EmployeeDashboard from '../../../../components/employee/employee-dashboard';
import EmployeeShell from '../../../../components/employee/employee-shell';
import HubstaffConnection from '../../../../components/employee/hubstaff-connection';
export default async function Page({ searchParams }) {
  const connected = (await searchParams).connected !== 'false';
  return <EmployeeShell name="Fixture Employee">
    <EmployeeDashboard name="Fixture Employee" connected={connected}>
      <HubstaffConnection connected={connected} />
    </EmployeeDashboard>
  </EmployeeShell>;
}
