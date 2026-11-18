import {redirect} from "next/navigation";

// Preserve old bookmarks without loading a second dashboard or polling runner.
export default function HubstaffIndexPage() {
  redirect("/admin#clients");
}
