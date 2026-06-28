import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import {
  SessionCreateSchema,
  SessionUpdateSchema,
  SessionListSchema,
  SessionAnswerSchema,
  AssignBankToSessionSchema,
  IdParamSchema,
} from "@interview/shared";
import * as svc from "./sessions.service.js";
import { requireRole, HR_AND_ABOVE, ALL_STAFF, ADMIN_AND_ABOVE, CONTENT_ROLES } from "../../lib/rbac.js";

const sessionsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireOrg = (reply: any, orgId: string | null | undefined): orgId is string => {
    if (!orgId) {
      reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
      return false;
    }
    return true;
  };

  // Read: all members
  fastify.get("/sessions", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    const requesterRole = await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const params = SessionListSchema.parse(request.query);
    return reply.send(await svc.listSessions(request.organizationId!, params, request.user!.id!, requesterRole));
  });

  fastify.get("/sessions/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.getSession(id, request.organizationId!) });
  });

  // Create/update/delete: OWNER, ADMIN, ORG_HR only
  fastify.post("/sessions", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const body = SessionCreateSchema.parse(request.body);
    return reply.status(201).send({ data: await svc.createSession(request.organizationId!, body) });
  });

  fastify.patch("/sessions/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const { id } = IdParamSchema.parse(request.params);
    const body = SessionUpdateSchema.parse(request.body);
    return reply.send({ data: await svc.updateSession(id, request.organizationId!, body) });
  });

  fastify.delete("/sessions/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const { id } = IdParamSchema.parse(request.params);
    await svc.deleteSession(id, request.organizationId!);
    return reply.status(204).send();
  });

  // Lifecycle: OWNER, ADMIN, ORG_HR
  fastify.post("/sessions/:id/start", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, [...ADMIN_AND_ABOVE, "ORG_MEMBER"]);
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.startSession(id, request.organizationId!) });
  });

  fastify.post("/sessions/:id/complete", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.completeSession(id, request.organizationId!) });
  });

  fastify.post("/sessions/:id/cancel", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.cancelSession(id, request.organizationId!) });
  });

  fastify.post("/sessions/:id/reactivate", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.reactivateSession(id, request.organizationId!) });
  });

  // Notes and answers: all staff who can view sessions
  fastify.patch("/sessions/:id/notes", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    const { notes } = request.body as { notes: string };
    return reply.send({ data: await svc.updateSessionNotes(id, request.organizationId!, notes ?? "") });
  });

  // Assign question bank: OWNER, ADMIN, ORG_HR, ORG_MEMBER
  fastify.post("/sessions/:id/assign-bank", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    const { bankId, replace } = AssignBankToSessionSchema.parse(request.body);
    return reply.send({ data: await svc.assignBankToSession(id, request.organizationId!, bankId, replace) });
  });

  fastify.put("/sessions/:id/questions/:sqId/answer", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    const { sqId } = request.params as { sqId: string };
    const body = SessionAnswerSchema.parse(request.body);
    return reply.send({ data: await svc.upsertAnswer(id, sqId, request.organizationId!, body) });
  });
};

export default sessionsRoutes;
