import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Permission } from "@task-tracker/shared";
import { useSession } from "../features/auth/session";
import { Spinner } from "../components/ui";

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.status === "loading") return <Spinner />;
  if (session.status === "anonymous") {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: Permission[];
  children: ReactNode;
}) {
  const session = useSession();
  if (!anyOf.some((p) => session.can(p))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
