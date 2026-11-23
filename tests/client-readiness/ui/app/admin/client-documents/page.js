import AdminShell from '../../../../../../components/admin/admin-shell';
import ClientDocumentAssignments from '../../../../../../components/admin/client-document-assignments';
export default function Page() {
  return <AdminShell admin={{id:'fixture-admin',name:'Fixture AOC Admin'}} active="documents" title="Document Library" description="Isolated document interaction fixture; no database or Google access."><ClientDocumentAssignments/></AdminShell>;
}
