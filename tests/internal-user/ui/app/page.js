// UI-only harness. No authentication, database, or real Hubstaff calls are made here.
import FixtureInternalUserPage from './fixture-internal-user-page';

export default async function Page({ searchParams }) {
  return <FixtureInternalUserPage searchParams={searchParams} />;
}
