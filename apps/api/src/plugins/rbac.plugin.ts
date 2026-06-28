import { prisma } from "../lib/prisma.js";
import type { PermissionAction } from "@interview/shared";

/**
 * Returns a Fastify preHandler that checks whether the authenticated user
 * has the given permission within the active organization.
 *
 * Rules:
 *   - OWNER always passes.
 *   - ADMIN always passes.
 *   - MEMBER passes only if one of their assigned roles grants the permission.
 */
export function requirePermission(action: PermissionAction) {
  return async function checkPermission(request: any, reply: any) {
    if (!request.user) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    const orgId = request.organizationId;
    if (!orgId) {
      return reply.status(400).send({
        error: { code: "MISSING_ORG", message: "Organization context required" },
      });
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: request.user.id },
      },
      include: {
        roleAssignments: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!member) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Not a member of this organization" },
      });
    }

    // Owners and admins have all permissions
    if (member.role === "OWNER" || member.role === "ADMIN") return;

    // Check role assignments for the specific permission
    const hasPermission = member.roleAssignments.some((ra) =>
      ra.role.permissions.some((rp) => rp.permission.action === action)
    );

    if (!hasPermission) {
      return reply.status(403).send({
        error: {
          code: "FORBIDDEN",
          message: `Missing permission: ${action}`,
        },
      });
    }
  };
}
