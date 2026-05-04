import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

function adminIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!adminIds().includes(user.id)) {
    redirect("/");
  }
  return user;
}
