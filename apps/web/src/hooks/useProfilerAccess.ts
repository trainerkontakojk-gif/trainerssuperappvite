import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const READ_ONLY_ROLES = ["leader", "qa"];

export function useProfilerAccess(): { isReadOnly: boolean; role: string } {
  const [role, setRole] = useState("trainer");
  const [isReadOnly, setIsReadOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      const userRole = (data?.role as string) || "trainer";
      setRole(userRole);
      setIsReadOnly(READ_ONLY_ROLES.includes(userRole));
    })().catch(() => {});
  }, []);

  return { isReadOnly, role };
}
