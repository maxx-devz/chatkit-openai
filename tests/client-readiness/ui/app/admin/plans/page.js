import AdminShell from '../../../../../../components/admin/admin-shell';import AdminPlans from '../../../../../../components/credits/admin-plans';
export default function Page(){return <AdminShell admin={{id:'fixture-admin',name:'Fixture AOC Admin'}} active="credits" title="Client Plans & Credits" description="Synthetic fixture only"><AdminPlans clientPath="/admin/plans"/></AdminShell>;}
