import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import {
  QuestionCreateSchema,
  QuestionUpdateSchema,
  QuestionListSchema,
  AIGenerateSchema,
  IdParamSchema,
} from "@interview/shared";
import * as svc from "./questions.service.js";
import { requireRole, ALL_STAFF, CONTENT_ROLES } from "../../lib/rbac.js";

const questionsRoutes: FastifyPluginAsync = async (fastify) => {
  // Read: all members
  fastify.get("/questions", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = QuestionListSchema.parse(request.query);
    return reply.send(await svc.listQuestions(request.organizationId, params));
  });

  fastify.get("/questions/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.getQuestion(id, request.organizationId) });
  });

  // Write: OWNER, ADMIN, ORG_MEMBER only
  fastify.post("/questions", { preHandler: [requireAuth] }, async (request, reply) => {
    const orgId = request.organizationId;
    if (!orgId) return reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
    await requireRole(orgId, request.user!.id!, CONTENT_ROLES);
    const body = QuestionCreateSchema.parse(request.body);
    return reply.status(201).send({ data: await svc.createQuestion(orgId, body) });
  });

  fastify.patch("/questions/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const orgId = request.organizationId;
    if (!orgId) return reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
    await requireRole(orgId, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    const body = QuestionUpdateSchema.parse(request.body);
    return reply.send({ data: await svc.updateQuestion(id, orgId, body) });
  });

  fastify.delete("/questions/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const orgId = request.organizationId;
    if (!orgId) return reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
    await requireRole(orgId, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    await svc.deleteQuestion(id, orgId);
    return reply.status(204).send();
  });

  // AI generation — all content roles
  fastify.post("/questions/generate", { preHandler: [requireAuth] }, async (request, reply) => {
    const body = AIGenerateSchema.parse(request.body);
    return reply.send({ data: await svc.aiGenerateQuestions(body) });
  });

  fastify.post("/questions/bulk", { preHandler: [requireAuth] }, async (request, reply) => {
    const orgId = request.organizationId;
    if (!orgId) return reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
    await requireRole(orgId, request.user!.id!, CONTENT_ROLES);
    const { questions } = request.body as { questions: any[] };
    return reply.status(201).send({ data: await svc.bulkSaveQuestions(orgId, questions) });
  });
};

export default questionsRoutes;
