import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";

export type FlowRole = "admin" | "operator" | "reviewer" | "viewer" | "user";
export type FlowPermission =
  | "cases.view"
  | "cases.create"
  | "documents.upload"
  | "evidence.query"
  | "agents.execute"
  | "approvals.decide"
  | "audit.view"
  | "evaluations.view"
  | "policies.manage"
  | "connectors.manage";

const rolePermissions: Record<FlowRole, readonly FlowPermission[]> = {
  admin: ["cases.view", "cases.create", "documents.upload", "evidence.query", "agents.execute", "approvals.decide", "audit.view", "evaluations.view", "policies.manage", "connectors.manage"],
  operator: ["cases.view", "cases.create", "documents.upload", "evidence.query", "agents.execute", "audit.view", "evaluations.view"],
  reviewer: ["cases.view", "evidence.query", "approvals.decide", "audit.view", "evaluations.view"],
  viewer: ["cases.view", "evidence.query", "evaluations.view"],
  user: ["cases.view", "evidence.query"],
};

export function isDemoMode() {
  return ENV.demoMode;
}

export function roleForUser(user: User | null): FlowRole | null {
  if (!user || user.status !== "active") return null;
  return user.role as FlowRole;
}

export function hasPermission(user: User | null, permission: FlowPermission) {
  const role = roleForUser(user);
  return Boolean(role && rolePermissions[role]?.includes(permission));
}

export function tenantForUser(user: User | null) {
  return user?.tenantKey ?? null;
}

export function assertAuthorization({ user, tenantKey, permission, allowDemo = false }: { user: User | null; tenantKey?: string; permission: FlowPermission; allowDemo?: boolean }) {
  if (!user) {
    if (allowDemo && ENV.demoMode && (!tenantKey || tenantKey === "demo")) {
      return { tenantKey: "demo", role: "operator" as const, userId: "demo-operator", isDemo: true };
    }
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authenticated identity, tenant, and role are required." });
  }
  const role = roleForUser(user);
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "User is suspended or missing an active role." });
  const resolvedTenant = tenantForUser(user);
  if (!resolvedTenant) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context is required; access denied." });
  if (tenantKey && tenantKey !== resolvedTenant) throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant access denied." });
  if (!hasPermission(user, permission)) throw new TRPCError({ code: "FORBIDDEN", message: `Role ${role} lacks permission ${permission}.` });
  return { tenantKey: resolvedTenant, role, userId: String(user.id), isDemo: false };
}

export function assertRole(user: User | null, roles: FlowRole[], allowDemo = false) {
  if (!user && allowDemo && ENV.demoMode) return { role: "operator" as const, tenantKey: "demo", userId: "demo-operator", isDemo: true };
  const role = roleForUser(user);
  if (!role || !roles.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Role is not authorized for this action." });
  return { role, tenantKey: tenantForUser(user)!, userId: String(user!.id), isDemo: false };
}
