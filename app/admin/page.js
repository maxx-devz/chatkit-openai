import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import aocLogo from "@/aoc-logo.png";
import AdminDashboard from "@/components/admin/admin-dashboard";
import SignOutButton from "@/components/auth/sign-out-button";
import loginStyles from "@/components/auth/login.module.css";
import { loadAdminDashboard } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AOC Administrator Portal",
  description: "Manage AOC client portal access and AI allowances",
};

export default async function AdminPage() {
  let dashboard;

  try {
    dashboard = await loadAdminDashboard(await headers());
  } catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");

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
          <h1>Administrator access required</h1>
          <p>
            {error?.publicDetails?.message
              || "This account cannot open the AOC administrator portal."}
          </p>
          <SignOutButton />
        </section>
      </main>
    );
  }

  return <AdminDashboard initialData={dashboard} />;
}
