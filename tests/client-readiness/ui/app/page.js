// Isolated component fixture; not part of the portal router. No real login,
// database or paid provider access. Authentication is tested separately.
import ClientPortal from '../../../../components/portal/client-portal';
import CreditsOverview from '../../../../components/credits/credits-overview';
import {clientPermissionsForRole} from '../../../../lib/client-permissions';
export default async function Page({searchParams}) {
  const params=await searchParams;
  const role=params.role || 'client_admin',view=params.view || 'credits';
  const client={id:'1',slug:'fixture',name:'Fixture Client',role,hubstaffProjectUrl:'https://tasks.hubstaff.com/app/organizations/1/projects/1'};
  const context={client,permissions:clientPermissionsForRole(role),user:{id:'fixture-user',username:'fixture.user',name:'Fixture User'},memberships:[client]};
  return <ClientPortal portalContext={context} requestedView={view} standalonePage={view==='credits'?'credits':undefined}>
    {view==='credits' && <CreditsOverview clientId="1"/>}
  </ClientPortal>;
}
