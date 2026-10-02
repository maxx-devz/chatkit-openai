// UI-only harness. No authentication, database, or real Hubstaff calls are made here.
import FixtureEmployeePage from './fixture-employee-page';

export default async function Page({ searchParams }) {
  return <FixtureEmployeePage searchParams={searchParams} />;
}
