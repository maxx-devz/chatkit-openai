import EmployeeShell from '../../../../../components/employee/employee-shell';
import { EmployeeWorkspaceProvider } from '../../../../../components/employee/employee-workspace-provider';

const PANELS = ['overview', 'my_tasks', 'activity', 'team_directory', 'team_tasks', 'hubstaff'];

export default function EmployeeLayout({ children }) {
  return <EmployeeWorkspaceProvider>
    <EmployeeShell name="Fixture Employee" position="Project Manager" panelAccess={PANELS} connected>
      {children}
    </EmployeeShell>
  </EmployeeWorkspaceProvider>;
}
