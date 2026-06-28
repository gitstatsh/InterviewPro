import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "@interview/shared";

const prisma = new PrismaClient();

const GLOBAL_ROLES: {
  name: string;
  description: string;
  permissions: typeof PERMISSIONS[number][];
}[] = [
  {
    name: "Interviewer",
    description: "Conducts interviews and submits assessments",
    permissions: [
      "candidates:read",
      "sessions:read",
      "sessions:update",
      "assessments:read",
      "assessments:create",
      "assessments:update",
      "questions:read",
      "reports:read",
    ],
  },
  {
    name: "Hiring Manager",
    description: "Manages the full hiring pipeline",
    permissions: [
      "candidates:read",
      "candidates:create",
      "candidates:update",
      "sessions:read",
      "sessions:create",
      "sessions:update",
      "assessments:read",
      "assessments:create",
      "assessments:update",
      "questions:read",
      "questions:create",
      "questions:update",
      "reports:read",
      "reports:generate",
      "members:read",
    ],
  },
  {
    name: "Recruiter",
    description: "Sources candidates and schedules interviews",
    permissions: [
      "candidates:read",
      "candidates:create",
      "candidates:update",
      "sessions:read",
      "sessions:create",
      "members:read",
      "reports:read",
    ],
  },
];

async function main() {
  console.log("Seeding permissions...");

  // Upsert all permissions
  for (const action of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { action },
      update: {},
      create: {
        action,
        resource: action.split(":")[0],
        description: `${action.split(":")[1]} ${action.split(":")[0]}`,
      },
    });
  }

  console.log(`✓ ${PERMISSIONS.length} permissions seeded`);

  // Create or update global roles
  for (const roleDef of GLOBAL_ROLES) {
    let role = await prisma.role.findFirst({
      where: { name: roleDef.name, isGlobal: true, organizationId: null },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          name: roleDef.name,
          description: roleDef.description,
          isGlobal: true,
          organizationId: null,
        },
      });
    } else {
      role = await prisma.role.update({
        where: { id: role.id },
        data: { description: roleDef.description },
      });
    }

    // Sync permissions
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const action of roleDef.permissions) {
      const perm = await prisma.permission.findUnique({ where: { action } });
      if (perm) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
    }

    console.log(`✓ Role "${role.name}" seeded with ${roleDef.permissions.length} permissions`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
