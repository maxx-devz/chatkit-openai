import FixtureInternalUserPage from '../fixture-internal-user-page';

export default function Page({ searchParams }) {
  return <FixtureInternalUserPage searchParams={searchParams} manager embedded />;
}
