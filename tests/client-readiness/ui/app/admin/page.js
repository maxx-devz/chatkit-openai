import AdminDashboard from '../../../../../components/admin/admin-dashboard';
import {adminView} from '../../../../../lib/admin-navigation';
const client=(id,slug,name)=>({id,slug,name,portalEnabled:true,aiEnabled:true,monthlyPromptLimit:150,requestsUsed:9,requestsRemaining:141,
  conversationCount:7,memberCount:1,approvedKnowledge:0,pendingKnowledge:0,createdAt:'2026-11-01T00:00:00Z',lastActivityAt:'2026-11-16T00:00:00Z',resetsAt:'2026-12-01T00:00:00Z',periodStart:'2026-11-01',
  vectorStoreId:'',approvedWebsiteUrl:'',hubstaffProjectUrl:'',hubstaffMonthlyHoursLimit:null,members:[{name,username:slug,role:'client_admin'}]});
export const fixtureAdmin={id:'fixture-admin',name:'Fixture AOC Admin',username:'fixture.admin',role:'admin'};
export const fixtureClients=[client('1','alpha','Alpha Client'),client('2','beta','Beta Client')];
export default async function Page({searchParams}) {const query=await searchParams;return <AdminDashboard initialData={{admin:fixtureAdmin,clients:fixtureClients}} view={adminView(query.view)}/>;}
