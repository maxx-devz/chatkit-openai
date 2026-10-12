import InternalUserShell from '../../../../../components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '../../../../../components/internal/internal-workspace-provider';

const PANELS = ['overview', 'my_tasks', 'activity', 'team_directory', 'team_tasks', 'hubstaff'];

export default function InternalUserLayout({ children }) {
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture Internal User" position="Project Manager" panelAccess={PANELS} connected>
      {children}
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
