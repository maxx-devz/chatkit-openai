import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { InternalRolePanelDetail } from '@/components/internal/internal-role-panels';
import InternalHrWorkspace from '@/components/internal/internal-hr-workspace';
import { resolveInternalUserContext } from '@/lib/internal-user-data';
import { canViewInternalRolePanel, internalRolePanel } from '@/lib/internal-role-panels';
import { INTERNAL_HR_PANEL_IDS } from '@/lib/internal-user-positions';
import { canAccessInternalPanel } from '@/lib/internal-panel-access';
import { internalUserDatabase } from '@/lib/internal-user-access';
import { auditInternalRoleView } from '@/lib/internal-panel-audit';

export const metadata = { title: 'My Workspace | AOC Internal Portal', robots: { index: false, follow: false } };

export default async function RolePanelPage({ params }) {
  const { role } = await params;
  let profile;
  let internalUser;
  try { ({ profile, internalUser } = await resolveInternalUserContext(await headers())); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    notFound();
  }
  if (!canViewInternalRolePanel(profile, role)) notFound();
  await auditInternalRoleView(internalUserDatabase(), internalUser.user_id, role);
  if (role === 'hr' && profile.roles.some(value => value === 'hr' || value === 'internal_admin')) {
    const panels = INTERNAL_HR_PANEL_IDS.filter(panel => canAccessInternalPanel(profile, panel));
    return <InternalHrWorkspace panels={panels} />;
  }
  return <InternalRolePanelDetail panel={internalRolePanel(role)} />;
}
