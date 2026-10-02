import EmployeePortalPage from '@/components/employee/employee-portal-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team workspace | AOC Employee Portal', robots: { index: false, follow: false } };

export default function EmployeeTeamPage({ searchParams }) {
  return <EmployeePortalPage workspace="team" searchParams={searchParams} />;
}
