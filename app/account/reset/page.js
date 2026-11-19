import AccountControls from "@/components/auth/account-controls";
export const dynamic = "force-dynamic";
export const metadata = { title: "Account security | AOC Portal", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() { return <AccountControls mode="reset" />; }
