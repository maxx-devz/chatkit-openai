// Isolated component fixture; not part of the portal router. No real login,
// database or paid provider access. Authentication is tested separately.
import '../fixture-database.mjs';
import {cookies} from 'next/headers';
import ClientPortal from '../../../../components/portal/client-portal';
import CreditsOverview from '../../../../components/credits/credits-overview';
import {clientPermissionsForRole} from '../../../../lib/client-permissions';
export default async function Page({searchParams}) {
  const params=await searchParams;
  const role=params.role || 'client_admin',view=params.view || 'credits';
  const first={id:'1',slug:'fixture',name:'Fixture Client',role,hubstaffProjectUrl:'https://tasks.hubstaff.com/app/organizations/1/projects/1'};
  const second={id:'2',slug:'second',name:'Second Fixture Client',role:'client_viewer',hubstaffProjectUrl:''};
  const multi=params.multi==='1',client=multi && (await cookies()).get('fixture_workspace')?.value==='second'?second:first;
  const context={client,permissions:clientPermissionsForRole(client.role),user:{id:'fixture-user',username:'fixture.user',name:'Fixture User'},memberships:multi?[first,second]:[first]};
  return <ClientPortal portalContext={context} requestedView={view} standalonePage={view==='credits'?'credits':undefined}>
    {view==='credits' && <CreditsOverview clientId={client.id} canRequest={context.permissions.includes("client.ai.use")}/>}
  </ClientPortal>;
}
