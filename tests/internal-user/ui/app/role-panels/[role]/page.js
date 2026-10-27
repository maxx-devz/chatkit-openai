import InternalUserShell from '../../../../../../components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '../../../../../../components/internal/internal-workspace-provider';
import { InternalRolePanelDetail } from '../../../../../../components/internal/internal-role-panels';
import { internalRolePanel } from '../../../../../../lib/internal-role-panels';

export default async function RolePanelFixturePage({ params }) {
  const { role } = await params;
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture Internal User" position="Team Member" roles={['hr', 'sales']}
      panelAccess={['hr_overview', 'hr_leave_calendar', 'hr_leave_requests', 'hr_leave_balances', 'hr_schedule_coverage']}
      rolePanelBasePath="/role-panels">
      <InternalRolePanelDetail panel={internalRolePanel(role)} />
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
