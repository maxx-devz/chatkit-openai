import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import aocLogo from "@/aoc-logo.png";
import SignOutButton from "@/components/auth/sign-out-button";
import loginStyles from "@/components/auth/login.module.css";
import ClientPortal from "@/components/portal/client-portal";
import { resolveAdminContext } from "@/lib/admin-data";
import { isPortalAuthConfigured } from "@/lib/auth";
import { resolvePortalContext } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isPortalAuthConfigured()) redirect("/login");

  let portalContext;
  const requestHeaders = await headers();

  try {
    portalContext = await resolvePortalContext(requestHeaders);
  } catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");

    let isAdministrator = false;
    try {
      await resolveAdminContext(requestHeaders);
      isAdministrator = true;
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

  return <ClientPortal portalContext={portalContext} />;
}
