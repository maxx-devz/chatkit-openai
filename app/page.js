import {clientPortalBrand} from "@/lib/agency-branding";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import aocLogo from "@/aoc-logo.png";
import SignOutButton from "@/components/auth/sign-out-button";
import loginStyles from "@/components/auth/login.module.css";
import ClientPortal from "@/components/portal/client-portal";
import { resolveAdminContext } from "@/lib/admin-data";
import { isPortalAuthConfigured } from "@/lib/auth";
import { resolvePortalContext, listWorkspaceChoices, clientShellContext } from "@/lib/portal-data";
import WorkspaceChooser from "@/components/portal/workspace-chooser";
import { notFound } from "next/navigation";
import { debuggerAccess, debuggerEnabled } from "@/lib/debugger/access";
import { DEBUGGER_PORTAL_HEADER, debuggerPortalPath } from "@/lib/debugger/routing";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }) {
  const params = await searchParams;
  if (params?.debugger === "true") {
    if (!debuggerEnabled()) notFound();
    const requestHeaders = await headers();
    const access = await debuggerAccess(requestHeaders);
    if (!access) notFound();
    const { default: DebuggerDashboard } = await import("@/components/debugger/dashboard");
    return <DebuggerDashboard config={access} portalPath={debuggerPortalPath(requestHeaders.get(DEBUGGER_PORTAL_HEADER))} />;
  }
  if (!isPortalAuthConfigured()) redirect("/login");

  let portalContext;
  const requestHeaders = await headers();

  try {
    portalContext = await resolvePortalContext(requestHeaders, { document: true });
  } catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");
    if (error?.publicDetails?.code === "internal_user_only") redirect("/internal");
    const code = error?.publicDetails?.code;
    if (["workspace_selection_required","workspace_denied","agency_client_gated"].includes(code)) {
      const choices = await listWorkspaceChoices(requestHeaders);
      return <main className={loginStyles.page}><div className={loginStyles.card}>
        <WorkspaceChooser choices={choices} message={code === "agency_client_gated" ? error.publicDetails.message : undefined} />
      </div></main>;
    }

    let isAdministrator = false;
    try {
      if (code === "client_membership_required") {
        await resolveAdminContext(requestHeaders);
        isAdministrator = true;
      }
    } catch {
      // The original client-access error is more useful for non-admin users.
    }

    if (isAdministrator) redirect("/admin");

    return (
      <main className={loginStyles.page}>
        <section className={`${loginStyles.card} ${loginStyles.accessCard}`}>
          <div className={loginStyles.brand}>
            <Image
              className={loginStyles.brandLogo}
              src={aocLogo}
              alt="Always Open Commerce"
              priority
            />
          </div>
          <h1>Portal access needs attention</h1>
          <p>{error?.publicDetails?.message || "The portal could not load your client account."}</p>
          <SignOutButton />
        </section>
      </main>
    );
  }

  return <ClientPortal key={portalContext.workspaceKey} portalContext={{...clientShellContext(portalContext),branding:await clientPortalBrand(portalContext)}} requestedView={params?.view} initialWebsite={params?.site} connectionResult={params?.connection} />;
}
