import AdminShell from '../../../../../../components/admin/admin-shell';
import DriveSources from '../../../../../../components/admin/drive-sources';
export default function Page() {return <AdminShell admin={{id:'fixture-admin',name:'Fixture AOC Admin'}} active="sources" title="Company knowledge" description="Isolated source-status fixture."><DriveSources embedded/></AdminShell>;}
