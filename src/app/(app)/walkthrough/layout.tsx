import { ManagerOnly } from "@/components/requireManagerPage";

export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ManagerOnly>{children}</ManagerOnly>;
}
