import { headers } from "next/headers";
import { debuggerAccess, debuggerEnabled } from "@/lib/debugger/access";
import DebuggerCapture from "./capture";
export default async function DebuggerGate() {
  if (!debuggerEnabled()) return null;
  const access = await debuggerAccess(await headers());
  return access ? <DebuggerCapture config={access} /> : null;
}
