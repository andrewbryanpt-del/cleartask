import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hasPermission, type Permission } from "@task-tracker/shared";
import {
  api,
  getRefreshToken,
  getStoredOrgId,
  hasStoredSession,
  setStoredOrgId,
  setTokens,
} from "../../lib/api";

export interface SessionOrg {
  id: string;
  name: string;
  industry: string | null;
  logoUrl: string | null;
  membershipId: string;
  isOwner: boolean;
  roleName: string | null;
  permissions: string[];
  departments?: { id: string; name: string; locationId: string }[];
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface MeResponse extends SessionUser {
  organizations: SessionOrg[];
}

interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
  organizations: Omit<SessionOrg, "departments">[];
}

interface SessionState {
  status: "loading" | "anonymous" | "authenticated";
  user: SessionUser | null;
  organizations: SessionOrg[];
  currentOrg: SessionOrg | null;
}

interface SessionContextValue extends SessionState {
  login(email: string, password: string): Promise<void>;
  register(input: {
    businessName: string;
    industry?: string;
    name: string;
    email: string;
    password: string;
  }): Promise<void>;
  logout(): Promise<void>;
  switchOrg(orgId: string): void;
  reloadSession(): Promise<void>;
  can(permission: Permission): boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function pickOrg(orgs: SessionOrg[]): SessionOrg | null {
  const stored = getStoredOrgId();
  return orgs.find((o) => o.id === stored) ?? orgs[0] ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: hasStoredSession() ? "loading" : "anonymous",
    user: null,
    organizations: [],
    currentOrg: null,
  });

  const applyMe = useCallback((me: MeResponse) => {
    const currentOrg = pickOrg(me.organizations);
    setStoredOrgId(currentOrg?.id ?? null);
    setState({
      status: "authenticated",
      user: { id: me.id, email: me.email, name: me.name, avatarUrl: me.avatarUrl },
      organizations: me.organizations,
      currentOrg,
    });
  }, []);

  const reloadSession = useCallback(async () => {
    try {
      applyMe(await api<MeResponse>("/me"));
    } catch {
      setTokens(null);
      setStoredOrgId(null);
      setState({ status: "anonymous", user: null, organizations: [], currentOrg: null });
    }
  }, [applyMe]);

  useEffect(() => {
    if (hasStoredSession()) void reloadSession();
  }, [reloadSession]);

  const applyAuthPayload = useCallback(
    async (payload: AuthPayload) => {
      setTokens(payload);
      const currentOrg = pickOrg(payload.organizations as SessionOrg[]);
      setStoredOrgId(currentOrg?.id ?? null);
      // /me also returns department membership, which screens need.
      applyMe(await api<MeResponse>("/me"));
    },
    [applyMe],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      async login(email, password) {
        const payload = await api<AuthPayload>("/auth/login", {
          method: "POST",
          body: { email, password },
        });
        await applyAuthPayload(payload);
      },
      async register(input) {
        const payload = await api<AuthPayload>("/auth/register", {
          method: "POST",
          body: input,
        });
        await applyAuthPayload(payload);
      },
      async logout() {
        const refreshToken = getRefreshToken();
        if (refreshToken) {
          await api("/auth/logout", { method: "POST", body: { refreshToken } }).catch(
            () => undefined,
          );
        }
        setTokens(null);
        setStoredOrgId(null);
        setState({ status: "anonymous", user: null, organizations: [], currentOrg: null });
      },
      switchOrg(orgId) {
        setStoredOrgId(orgId);
        setState((prev) => ({
          ...prev,
          currentOrg: prev.organizations.find((o) => o.id === orgId) ?? prev.currentOrg,
        }));
      },
      reloadSession,
      can(permission) {
        const org = state.currentOrg;
        if (!org) return false;
        return hasPermission(
          { isOwner: org.isOwner, permissions: new Set(org.permissions) },
          permission,
        );
      },
    }),
    [state, applyAuthPayload, reloadSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
