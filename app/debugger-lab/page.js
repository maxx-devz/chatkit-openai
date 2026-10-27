import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { debuggerAccess } from "@/lib/debugger/access";
import { debuggerLabEnabled } from "@/lib/debugger/security";
import DebuggerProbes from "@/components/debugger/probes";
export default async function DebuggerLab() {
  if (!debuggerLabEnabled() || !await debuggerAccess(await headers())) notFound();
  return <DebuggerProbes />;
}
