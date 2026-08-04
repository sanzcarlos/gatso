import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import SplitwiseImportClient from "./splitwise-import-client";

export default async function SplitwiseImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <SplitwiseImportClient />;
}
