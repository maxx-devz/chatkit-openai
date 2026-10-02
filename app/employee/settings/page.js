import EmployeePortalPage from '@/components/employee/employee-portal-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings | AOC Employee Portal', robots: { index: false, follow: false } };

export default function EmployeeSettingsPage({ searchParams }) {
  return <EmployeePortalPage workspace="settings" searchParams={searchParams} />;
}
