import { prisma } from "../../lib/prisma.js";
import { paginate, paginationMeta } from "@interview/shared";
import type { RoleCreateInput, RoleUpdateInput, RoleListInput } from "@interview/shared";

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles(orgId: string | null, params: RoleListInput) {
  const { page, limit, search, sortOrder, isGlobal } = params;
  const { skip, take } = paginate(page, limit);

  const where = {
    ...(isGlobal !== undefined
      ? { isGlobal }
      : {
          OR: [
            { isGlobal: true },
            { organizationId: orgId ?? undefined },
          ],
        }),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [roles, total] = await Promise.all([
    prisma.role.findMany({
      where,
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { name: sortOrder },
      skip,
      take,
    }),
    prisma.role.count({ where }),
  ]);

  return { data: roles, meta: paginationMeta(total, page, limit) };
}

export async function getRole(roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { assignments: true } },
    },
  });
  if (!role) throw notFound("Role");
  return role;
}

export async function createRole(
  orgId: string,
  userId: string,
  data: RoleCreateInput
) {
  await requireOrgAdmin(orgId, userId);

  const existing = await prisma.role.findFirst({
    where: { name: data.name, organizationId: orgId },
  });
  if (existing) throw conflict("A role with that name already exists");

  const permissions = await prisma.permission.findMany({
    where: { action: { in: data.permissions as string[] } },
  });

  return prisma.role.create({
    data: {
      name: data.name,
      description: data.description,
      isGlobal: false,
      organizationId: orgId,
      permissions: {
        create: permissions.map((p) => ({ permissionId: p.id })),
      },
    },
    include: { permissions: { include: { permission: true } } },
  });
}

export async function updateRole(
  roleId: string,
  orgId: string,
  userId: string,
  data: RoleUpdateInput
) {
  await requireOrgAdmin(orgId, userId);
  const role = await getRole(roleId);

  if (role.isGlobal) throw forbidden("Global roles cannot be modified");
  if (role.organizationId !== orgId) throw notFound("Role");

  const updates: any = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;

  if (data.permissions !== undefined) {
    const permissions = await prisma.permission.findMany({
      where: { action: { in: data.permissions as string[] } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId, permissionId: p.id })),
    });
  }

  return prisma.role.update({
    where: { id: roleId },
    data: updates,
    include: { permissions: { include: { permission: true } } },
  });
}

export async function deleteRole(roleId: string, orgId: string, userId: string) {
  await requireOrgAdmin(orgId, userId);
  const role = await getRole(roleId);
  if (role.isGlobal) throw forbidden("Global roles cannot be deleted");
  if (role.organizationId !== orgId) throw notFound("Role");
  return prisma.role.delete({ where: { id: roleId } });
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function listPermissions() {
  return prisma.permission.findMany({ orderBy: { action: "asc" } });
}

// ─── Role Assignments ─────────────────────────────────────────────────────────

export async function assignRoleToMember(
  orgId: string,
  memberId: string,
  roleId: string,
  requesterId: string
) {
  await requireOrgAdmin(orgId, requesterId);

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: orgId },
  });
  if (!member) throw notFound("Member");

  const role = await prisma.role.findFirst({
    where: { id: roleId, OR: [{ isGlobal: true }, { organizationId: orgId }] },
  });
  if (!role) throw notFound("Role");

  const existing = await prisma.roleAssignment.findUnique({
    where: { memberId_roleId: { memberId, roleId } },
  });
  if (existing) throw conflict("Role already assigned");

  return prisma.roleAssignment.create({
    data: { memberId, roleId },
    include: { role: true },
  });
}

export async function removeRoleFromMember(
  orgId: string,
  memberId: string,
  roleId: string,
  requesterId: string
) {
  await requireOrgAdmin(orgId, requesterId);

  const assignment = await prisma.roleAssignment.findUnique({
    where: { memberId_roleId: { memberId, roleId } },
  });
  if (!assignment) throw notFound("Role assignment");

  return prisma.roleAssignment.delete({
    where: { memberId_roleId: { memberId, roleId } },
  });
}

export async function getMemberRoles(orgId: string, memberId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: orgId },
    include: {
      roleAssignments: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });
  if (!member) throw notFound("Member");
  return member.roleAssignments.map((ra) => ra.role);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireOrgAdmin(orgId: string, userId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
  });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    throw forbidden("Admin access required");
  }
  return member;
}

function notFound(entity: string) {
  return Object.assign(new Error(`${entity} not found`), {
    code: "NOT_FOUND",
    statusCode: 404,
  });
}

function conflict(msg: string) {
  return Object.assign(new Error(msg), { code: "CONFLICT", statusCode: 409 });
}

function forbidden(msg: string) {
  return Object.assign(new Error(msg), { code: "FORBIDDEN", statusCode: 403 });
}
