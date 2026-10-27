import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { debuggerAccess } from "@/lib/debugger/access";
import { debuggerLabEnabled } from "@/lib/debugger/security";
import WorkflowPreview from "@/components/debugger/workflow-preview";

export default async function WorkflowLab() {
  if (!debuggerLabEnabled() || !await debuggerAccess(await headers())) notFound();
  return <WorkflowPreview />;
}
