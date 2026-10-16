import InternalUserShell from '@/components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '@/components/internal/internal-workspace-provider';
import InternalPmWorkspace from '@/components/internal/internal-pm-workspace';
import { internalUserPermissions } from '@/lib/internal-permissions';

const roles = ['project_management'];
const panels = ['pm_projects', 'pm_project_tasks'];

export default function PmWorkspaceFixturePage() {
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture Project Manager" position="Project Manager" roles={roles}
      panelAccess={panels} permissions={internalUserPermissions(roles)}>
      <InternalPmWorkspace panels={panels} />
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
