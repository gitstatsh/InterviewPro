import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import {
  OrganizationCreateSchema,
  OrganizationUpdateSchema,
  InviteMemberSchema,
  MemberListSchema,
  IdParamSchema,
} from "@interview/shared";
import * as svc from "./organizations.service.js";

const orgRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Organizations ─────────────────────────────────────────────────────────

  fastify.post(
    "/organizations",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = OrganizationCreateSchema.parse(request.body);
      const org = await svc.createOrganization(request.user!.id, body);
      return reply.status(201).send({ data: org });
    }
  );

  fastify.get(
    "/organizations",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const orgs = await svc.getUserOrganizations(request.user!.id);
      return reply.send({ data: orgs });
    }
  );

  fastify.get(
    "/organizations/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const org = await svc.getOrganization(id, request.user!.id);
      return reply.send({ data: org });
    }
  );

  fastify.patch(
    "/organizations/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const body = OrganizationUpdateSchema.parse(request.body);
      const org = await svc.updateOrganization(id, request.user!.id, body);
      return reply.send({ data: org });
    }
  );

  fastify.delete(
    "/organizations/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      await svc.deleteOrganization(id, request.user!.id);
      return reply.status(204).send();
    }
  );

  // ── Members ───────────────────────────────────────────────────────────────

  fastify.get(
    "/organizations/:id/members",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const params = MemberListSchema.parse(request.query);
      const result = await svc.listMembers(id, request.user!.id, params);
      return reply.send(result);
    }
  );

  fastify.post(
    "/organizations/:id/members/invite",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const body = InviteMemberSchema.parse(request.body);
      const member = await svc.inviteMember(id, request.user!.id, body);
      return reply.status(201).send({ data: member });
    }
  );

  fastify.delete(
    "/organizations/:id/members/:memberId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const { memberId } = request.params as { memberId: string };
      await svc.removeMember(id, request.user!.id, memberId);
      return reply.status(204).send();
    }
  );
};

export default orgRoutes;
