import InternalUserShell from '@/components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '@/components/internal/internal-workspace-provider';
import { internalUserPermissions } from '@/lib/internal-permissions';

export default function SidebarSubnavFixture() {
  const roles = ['internal_access_manager'];
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture Access Manager" position="Team Member" roles={roles}
      panelAccess={['overview']} permissions={internalUserPermissions(roles)}>
      <main><h1>Sidebar sub-navigation fixture</h1></main>
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
