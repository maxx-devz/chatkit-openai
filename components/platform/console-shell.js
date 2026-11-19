"use client";
import AdminDraftProvider from "@/components/admin/admin-draft-provider";
import AdminShell from "@/components/admin/admin-shell";
const navigation = [["overview","Agencies","/platform","agencies"],["clients","AOC client delivery","/admin/aoc","delivery"],["shield","Support approvals","/support/requests","support"]];
export default function ConsoleShell({ admin, active = "agencies", title, description, children, delivery = false }) {
  return <AdminDraftProvider><AdminShell admin={admin} active={active} title={title} description={description} navigation={delivery ? navigation.slice(1) : navigation} platform={!delivery}>{children}</AdminShell></AdminDraftProvider>;
}
