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
  // New owners go through the setup wizard before anything else; invited
  // members never see it.
  const needsOnboarding =
    session.currentOrg?.isOwner === true && !session.currentOrg.onboarded;
  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (!needsOnboarding && location.pathname === "/onboarding") {
    return <Navigate to="/dashboard" replace />;
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
  // Own-only roles are locked out of permission-gated areas entirely —
  // the restriction overrides any grants the role also carries.
  if (session.isRestricted || !anyOf.some((p) => session.can(p))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireUnrestricted({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.isRestricted) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Owner-only screens — invited members are turned away regardless of
// their role's permissions.
export function RequireOwner({ children }: { children: ReactNode }) {
  const session = useSession();
  if (!session.currentOrg?.isOwner) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
