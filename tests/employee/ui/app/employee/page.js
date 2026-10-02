import FixtureEmployeePage from '../fixture-employee-page';

export default function Page({ searchParams }) {
  return <FixtureEmployeePage searchParams={searchParams} manager embedded />;
}
