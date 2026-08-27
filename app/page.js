import Workspace from "@/components/workspace";
import { SITE_CONFIG } from "@/config/site";

export default function HomePage() {
  return <Workspace config={SITE_CONFIG} />;
}
