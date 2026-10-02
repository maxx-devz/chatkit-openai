import EmployeePortalPage from '@/components/employee/employee-portal-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My work | AOC Employee Portal', robots: { index: false, follow: false } };

export default async function EmployeePage({ searchParams }) {
  return <EmployeePortalPage workspace="personal" searchParams={searchParams} />;
}
