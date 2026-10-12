import InternalUserPortalPage from '@/components/internal/internal-portal-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings | AOC Internal Portal', robots: { index: false, follow: false } };

export default function InternalUserSettingsPage({ searchParams }) {
  return <InternalUserPortalPage workspace="settings" searchParams={searchParams} />;
}
