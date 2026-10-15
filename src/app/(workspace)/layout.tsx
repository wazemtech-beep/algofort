import Workspace from "@/components/Workspace";
import { currentOwner } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  if (!await currentOwner()) redirect("/login");
  return <Workspace>{children}</Workspace>;
}
