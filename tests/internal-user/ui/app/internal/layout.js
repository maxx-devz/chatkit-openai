import InternalUserShell from '../../../../../components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '../../../../../components/internal/internal-workspace-provider';

const PANELS = ['overview', 'my_tasks', 'activity', 'team_directory', 'account_settings', 'hubstaff'];
const PERMISSIONS = ['work.overview.read', 'work.tasks.read', 'work.activity.read',
  'hubstaff.connection.read', 'people.directory.read', 'account.password.change'];

export default function InternalUserLayout({ children }) {
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture Internal User" position="Project Manager" panelAccess={PANELS}
      permissions={PERMISSIONS} connected>
      {children}
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
