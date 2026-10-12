import InternalUserPortalPage from '@/components/internal/internal-portal-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team workspace | AOC Internal Portal', robots: { index: false, follow: false } };

export default function InternalUserTeamPage({ searchParams }) {
  return <InternalUserPortalPage workspace="team" searchParams={searchParams} />;
}
