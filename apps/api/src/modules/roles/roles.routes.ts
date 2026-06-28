import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import {
  RoleCreateSchema,
  RoleUpdateSchema,
  AssignRoleSchema,
  RoleListSchema,
  IdParamSchema,
} from "@interview/shared";
import * as svc from "./roles.service.js";

const rolesRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Global / org roles ────────────────────────────────────────────────────

  // List roles (global + org-specific for the active org)
  fastify.get(
    "/roles",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = RoleListSchema.parse(request.query);
      const orgId = request.organizationId;
      const result = await svc.listRoles(orgId, params);
      return reply.send(result);
    }
  );

  fastify.get(
    "/roles/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const role = await svc.getRole(id);
      return reply.send({ data: role });
    }
  );

  fastify.post(
    "/roles",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const orgId = request.organizationId;
      if (!orgId) {
        return reply.status(400).send({
          error: { code: "MISSING_ORG", message: "Organization context required" },
        });
      }
      const body = RoleCreateSchema.parse(request.body);
      const role = await svc.createRole(orgId, request.user!.id, body);
      return reply.status(201).send({ data: role });
    }
  );

  fastify.patch(
    "/roles/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const orgId = request.organizationId;
      if (!orgId) return reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
      const body = RoleUpdateSchema.parse(request.body);
      const role = await svc.updateRole(id, orgId, request.user!.id, body);
      return reply.send({ data: role });
    }
  );

  fastify.delete(
    "/roles/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const orgId = request.organizationId;
      if (!orgId) return reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
      await svc.deleteRole(id, orgId, request.user!.id);
      return reply.status(204).send();
    }
  );

  // ── Permissions ────────────────────────────────────────────────────────────

  fastify.get(
    "/permissions",
    { preHandler: [requireAuth] },
    async (_request, reply) => {
      const permissions = await svc.listPermissions();
      return reply.send({ data: permissions });
    }
  );

  // ── Member role assignments ────────────────────────────────────────────────

  fastify.get(
    "/organizations/:id/members/:memberId/roles",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id, memberId } = request.params as { id: string; memberId: string };
      const roles = await svc.getMemberRoles(id, memberId);
      return reply.send({ data: roles });
    }
  );

  fastify.post(
    "/organizations/:id/members/:memberId/roles",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id, memberId } = request.params as { id: string; memberId: string };
      const { roleId } = AssignRoleSchema.parse(request.body);
      const assignment = await svc.assignRoleToMember(id, memberId, roleId, request.user!.id);
      return reply.status(201).send({ data: assignment });
    }
  );

  fastify.delete(
    "/organizations/:id/members/:memberId/roles/:roleId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id, memberId, roleId } = request.params as {
        id: string;
        memberId: string;
        roleId: string;
      };
      await svc.removeRoleFromMember(id, memberId, roleId, request.user!.id);
      return reply.status(204).send();
    }
  );
};

export default rolesRoutes;
