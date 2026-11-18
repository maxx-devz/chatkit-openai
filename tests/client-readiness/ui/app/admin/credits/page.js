import AdminShell from '../../../../../../components/admin/admin-shell';
import AdminCreditPricing from '../../../../../../components/credits/admin-credit-pricing';
export default function Page() {return <AdminShell admin={{id:'fixture-admin',name:'Fixture AOC Admin'}} active="credits" title="AI Pricing & Credits" description="Isolated fixture; no live mutations."><AdminCreditPricing adminId="fixture-admin"/></AdminShell>;}
