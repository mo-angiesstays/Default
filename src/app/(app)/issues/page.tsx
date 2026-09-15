import { getCurrentUser } from "@/lib/auth";
import { IssuesView } from "./IssuesView";

export const dynamic = "force-dynamic";

export default async function IssuesPage() {
  const user = await getCurrentUser();
  return <IssuesView viewer={user!} />;
}
