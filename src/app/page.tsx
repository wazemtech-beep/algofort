import Workspace from "@/components/Workspace";
import { currentOwner } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() { const current = await currentOwner(); if (!current) redirect("/login"); return <Workspace />; }
