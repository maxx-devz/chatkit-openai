"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export default function SignOutButton({ className = "" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    await authClient.signOut().catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className={className} disabled={busy} onClick={signOut} type="button">
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
