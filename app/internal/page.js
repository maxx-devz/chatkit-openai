import InternalUserPortalPage from '@/components/internal/internal-portal-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My work | AOC Internal Portal', robots: { index: false, follow: false } };

export default async function InternalUserPage({ searchParams }) {
  return <InternalUserPortalPage workspace="personal" searchParams={searchParams} />;
}
