import { prisma } from "./prisma.js";

export type MemberRole = "OWNER" | "ORG_HR" | "ORG_MEMBER";

// Convenience role sets used across route handlers
export const HR_AND_ABOVE: MemberRole[] = ["OWNER", "ORG_HR"];
export const ALL_STAFF: MemberRole[] = ["OWNER", "ORG_HR", "ORG_MEMBER"];
export const ADMIN_AND_ABOVE: MemberRole[] = ["OWNER"];
export const CONTENT_ROLES: MemberRole[] = ["OWNER", "ORG_MEMBER"]; // questions / banks

export async function getMemberRole(
  orgId: string | null | undefined,
  userId: string | null | undefined
): Promise<MemberRole | null> {
  if (!orgId || !userId) return null;
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { role: true },
  });
  return (member?.role as MemberRole) ?? null;
}

export async function requireRole(
  orgId: string | null | undefined,
  userId: string | null | undefined,
  allowed: MemberRole[]
): Promise<MemberRole> {
  const role = await getMemberRole(orgId, userId);
  if (!role || !allowed.includes(role)) {
    throw Object.assign(
      new Error("You don't have permission to perform this action"),
      { code: "FORBIDDEN", statusCode: 403 }
    );
  }
  return role;
}
