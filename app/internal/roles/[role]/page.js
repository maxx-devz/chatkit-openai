import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { InternalRolePanelDetail } from '@/components/internal/internal-role-panels';
import { resolveInternalUserContext } from '@/lib/internal-user-data';
import { canViewInternalRolePanel, internalRolePanel } from '@/lib/internal-role-panels';

export const metadata = { title: 'My Workspace | AOC Internal Portal', robots: { index: false, follow: false } };

export default async function RolePanelPage({ params }) {
  const { role } = await params;
  let profile;
  try { ({ profile } = await resolveInternalUserContext(await headers())); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    notFound();
  }
  if (!canViewInternalRolePanel(profile, role)) notFound();
  return <InternalRolePanelDetail panel={internalRolePanel(role)} />;
}
