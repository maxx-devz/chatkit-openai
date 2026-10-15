import InternalUserShell from '../../../../../components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '../../../../../components/internal/internal-workspace-provider';
import InternalHrWorkspace from '../../../../../components/internal/internal-hr-workspace';

export default function HrWorkspaceFixturePage() {
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture HR User" position="HR Admin" roles={['hr']}
      panelAccess={['hr_overview', 'hr_leave_calendar', 'hr_leave_requests', 'hr_leave_balances', 'hr_schedule_coverage']}
      rolePanelBasePath="/role-panels">
      <InternalHrWorkspace panels={['hr_overview', 'hr_leave_calendar', 'hr_leave_requests',
        'hr_leave_balances', 'hr_schedule_coverage']} />
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
