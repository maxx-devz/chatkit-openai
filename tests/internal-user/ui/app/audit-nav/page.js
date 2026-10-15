import InternalUserShell from '../../../../../components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '../../../../../components/internal/internal-workspace-provider';
import { internalUserPermissions } from '../../../../../lib/internal-permissions';

export default async function AuditNavFixturePage({ searchParams }) {
  const params = await searchParams;
  const roles = params?.viewer === 'ordinary' ? [] : ['internal_access_manager'];
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture Internal User" position="Team Member" roles={roles}
      panelAccess={['overview']} permissions={internalUserPermissions(roles)}>
      <main><h1>Audit navigation fixture</h1></main>
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
