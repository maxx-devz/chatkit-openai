import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveInternalUserContext } from '@/lib/internal-user-data';
import { availableInternalRolePanels } from '@/lib/internal-role-panels';

export const metadata = { title: 'My Workspace | AOC Internal Portal', robots: { index: false, follow: false } };

export default async function RolePanelsPage() {
  let profile;
  try { ({ profile } = await resolveInternalUserContext(await headers())); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    redirect('/');
  }
  const panels = availableInternalRolePanels(profile);
  if (!panels.length) redirect('/internal');
  redirect(`/internal/roles/${panels[0].id}`);
}
