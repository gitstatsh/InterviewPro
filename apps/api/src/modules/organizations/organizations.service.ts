import { Resend } from "resend";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { registerInviteCapture } from "../../lib/invite-capture.js";
import { paginate, paginationMeta } from "@interview/shared";
import type {
  OrganizationCreateInput,
  OrganizationUpdateInput,
  InviteMemberInput,
  MemberListInput,
} from "@interview/shared";

export async function createOrganization(
  userId: string,
  data: OrganizationCreateInput
) {
  const baseSlug = data.slug ||
    data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let slug = baseSlug;
  let suffix = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  return prisma.organization.create({
    data: {
      name: data.name,
      slug,
      website: data.website || null,
      description: data.description,
      logo: data.logo ?? null,
      members: {
        create: { userId, role: "OWNER" },
      },
    },
  });
}

export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({ ...m.organization, memberRole: m.role }));
}

export async function getOrganization(orgId: string, userId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
  });
  if (!member) {
    throw Object.assign(new Error("Organization not found"), {
      code: "NOT_FOUND",
      statusCode: 404,
    });
  }
  return prisma.organization.findUnique({ where: { id: orgId } });
}

export async function updateOrganization(
  orgId: string,
  userId: string,
  data: OrganizationUpdateInput
) {
  await requireOrgRole(orgId, userId, ["OWNER", "ORG_HR"]);
  return prisma.organization.update({
    where: { id: orgId },
    data: {
      name: data.name,
      website: data.website || null,
      description: data.description,
      ...(data.logo !== undefined ? { logo: data.logo } : {}),
    },
  });
}

export async function deleteOrganization(orgId: string, userId: string) {
  await requireOrgRole(orgId, userId, ["OWNER"]);
  return prisma.organization.delete({ where: { id: orgId } });
}

export async function listMembers(
  orgId: string,
  userId: string,
  params: MemberListInput
) {
  const requester = await assertMember(orgId, userId);

  const { page, limit, search, sortBy, sortOrder, role } = params;
  const { skip, take } = paginate(page, limit);

  // Only OWNER and ADMIN can see the Owner row
  const canSeeOwner = requester.role === "OWNER";

  const where: any = {
    organizationId: orgId,
    ...(role ? { role } : (!canSeeOwner ? { role: { not: "OWNER" } } : {})),
    ...(search
      ? {
          user: {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [members, total] = await Promise.all([
    prisma.organizationMember.findMany({
      where,
      include: {
        user: {
          select: {
            id: true, name: true, email: true, image: true, emailVerified: true,
            accounts: { select: { providerId: true, password: true } },
          },
        },
      },
      orderBy: sortBy === "name"
        ? { user: { name: sortOrder } }
        : { createdAt: sortOrder },
      skip,
      take,
    }),
    prisma.organizationMember.count({ where }),
  ]);

  const data = members.map(({ user: { accounts, ...user }, ...member }) => ({
    ...member,
    user: {
      ...user,
      isPending: !accounts.some((a) => a.providerId === "credential" && a.password),
    },
  }));

  return { data, meta: paginationMeta(total, page, limit) };
}

export async function inviteMember(
  orgId: string,
  inviterId: string,
  data: InviteMemberInput
) {
  await requireOrgRole(orgId, inviterId, ["OWNER", "ORG_HR"]);

  // Find or implicitly create a user record for the invitee
  let invitee = await prisma.user.findUnique({ where: { email: data.email } });

  if (!invitee) {
    // Create a placeholder user — they'll set their password via the invite link
    invitee = await prisma.user.create({
      data: {
        name: data.email.split("@")[0],
        email: data.email,
        emailVerified: false,
      },
    });
  }

  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: invitee.id },
    },
  });
  if (existing) {
    throw Object.assign(new Error("User is already a member"), {
      code: "ALREADY_MEMBER",
      statusCode: 409,
    });
  }

  const member = await prisma.organizationMember.create({
    data: { organizationId: orgId, userId: invitee.id, role: data.role },
    include: {
      user: { select: { id: true, name: true, email: true, emailVerified: true } },
    },
  });

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  const inviter = await prisma.user.findUnique({ where: { id: inviterId }, select: { name: true } });

  // Fire-and-forget — email failure must not block member creation
  sendInviteEmail({
    invitee,
    orgName: org!.name,
    inviterName: inviter?.name ?? "Your team",
    isNewUser: !invitee.emailVerified,
  }).catch(err => console.error("Invite email failed:", err?.message ?? err));

  return member;
}

async function sendInviteEmail({
  invitee,
  orgName,
  inviterName,
  isNewUser,
}: {
  invitee: { id: string; email: string; name: string };
  orgName: string;
  inviterName: string;
  isNewUser: boolean;
}) {
  if (!env.RESEND_API_KEY) return;

  const from = `Interview Platform <${env.FROM_EMAIL ?? "onboarding@resend.dev"}>`;
  const resend = new Resend(env.RESEND_API_KEY);
  const frontendUrl = env.FRONTEND_URL ?? "http://localhost:3000";
  const deliverTo = env.EMAIL_OVERRIDE_TO ?? invitee.email;

  let actionUrl = frontendUrl;
  let actionLabel = "Sign in";
  let bodyHtml = "";

  if (isNewUser) {
    // Register capture BEFORE triggering the reset so sendResetPassword
    // hands the URL back here instead of sending a generic reset email
    const urlCapture = registerInviteCapture(invitee.email);
    console.log(`[invite] triggering password reset for ${invitee.email} via ${env.BETTER_AUTH_URL}`);
    const resetRes = await fetch(`${env.BETTER_AUTH_URL}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: invitee.email, redirectTo: `${frontendUrl}/reset-password` }),
    });
    console.log(`[invite] reset request status: ${resetRes.status}`);
    actionUrl = await Promise.race([
      urlCapture,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("URL capture timeout")), 10000)),
    ]);
    console.log(`[invite] captured reset URL: ${actionUrl}`);
    actionLabel = "Set up your account";
    bodyHtml = `
      <p>Hi,</p>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Interview Platform.</p>
      <p>Click below to set up your account and get started:</p>
      <p style="margin:24px 0">
        <a href="${actionUrl}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${actionLabel}</a>
      </p>
      <p style="color:#6b7280;font-size:13px">This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.</p>
    `;
  } else {
    actionUrl = `${frontendUrl}/dashboard`;
    actionLabel = "Go to dashboard";
    bodyHtml = `
      <p>Hi ${invitee.name},</p>
      <p><strong>${inviterName}</strong> has added you to <strong>${orgName}</strong> on Interview Platform.</p>
      <p>You can access the organisation right away:</p>
      <p style="margin:24px 0">
        <a href="${actionUrl}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${actionLabel}</a>
      </p>
    `;
  }

  console.log(`[invite] sending email to ${deliverTo} (invitee: ${invitee.email})`);
  const result = await resend.emails.send({
    from,
    to: deliverTo,
    subject: `You've been invited to ${orgName} on Interview Platform`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
        ${bodyHtml}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0"/>
        <p style="color:#9ca3af;font-size:12px">Interview Platform · Standardising technical interviews</p>
      </div>
    `,
  });
  console.log(`[invite] email sent, id: ${(result as any)?.id ?? JSON.stringify(result)}`);
}

export async function removeMember(
  orgId: string,
  requesterId: string,
  memberId: string
) {
  await requireOrgRole(orgId, requesterId, ["OWNER", "ORG_HR"]);

  const target = await prisma.organizationMember.findUnique({
    where: { id: memberId },
  });

  if (!target || target.organizationId !== orgId) {
    throw Object.assign(new Error("Member not found"), {
      code: "NOT_FOUND",
      statusCode: 404,
    });
  }
  if (target.role === "OWNER") {
    throw Object.assign(new Error("Cannot remove the owner"), {
      code: "CANNOT_REMOVE_OWNER",
      statusCode: 403,
    });
  }
  if (target.userId === requesterId) {
    throw Object.assign(new Error("You cannot remove yourself from the organisation"), {
      code: "CANNOT_REMOVE_SELF",
      statusCode: 403,
    });
  }

  return prisma.organizationMember.delete({ where: { id: memberId } });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireOrgRole(
  orgId: string,
  userId: string,
  roles: string[]
) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
  });
  if (!member || !roles.includes(member.role)) {
    throw Object.assign(
      new Error("You don't have permission to perform this action"),
      { code: "FORBIDDEN", statusCode: 403 }
    );
  }
  return member;
}

async function assertMember(orgId: string, userId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
  });
  if (!member) {
    throw Object.assign(new Error("Organization not found"), {
      code: "NOT_FOUND",
      statusCode: 404,
    });
  }
  return member;
}
