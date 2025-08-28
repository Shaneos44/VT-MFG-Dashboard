// app/page.tsx
import ScaleUpDashboard from "@/components/ScaleUpDashboard";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // If there is no session, send users to /login BEFORE the dashboard mounts
  if (error || !user) {
    redirect("/login");
  }

  // Authenticated: render your dashboard (it will call /api/configurations and succeed)
  return <ScaleUpDashboard />;
}
