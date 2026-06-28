import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import {
  QuestionBankCreateSchema,
  QuestionBankUpdateSchema,
  QuestionBankListSchema,
  AddQuestionsToBankSchema,
  GenerateFromJDSchema,
  IdParamSchema,
} from "@interview/shared";
import * as svc from "./question-banks.service.js";
import { requireRole, ALL_STAFF, CONTENT_ROLES } from "../../lib/rbac.js";

function requireOrg(reply: any, orgId: string | null | undefined): orgId is string {
  if (!orgId) {
    reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
    return false;
  }
  return true;
}

const questionBanksRoutes: FastifyPluginAsync = async (fastify) => {
  // Read: all members
  fastify.get("/question-banks", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const params = QuestionBankListSchema.parse(request.query);
    return reply.send(await svc.listBanks(request.organizationId!, params));
  });

  fastify.get("/question-banks/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.getBank(id, request.organizationId!) });
  });

  // Write: OWNER, ADMIN, ORG_MEMBER only
  fastify.post("/question-banks", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const body = QuestionBankCreateSchema.parse(request.body);
    return reply.status(201).send({ data: await svc.createBank(request.organizationId!, request.user!.id!, body) });
  });

  fastify.patch("/question-banks/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    const body = QuestionBankUpdateSchema.parse(request.body);
    return reply.send({ data: await svc.updateBank(id, request.organizationId!, body) });
  });

  fastify.delete("/question-banks/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    await svc.deleteBank(id, request.organizationId!);
    return reply.status(204).send();
  });

  fastify.post("/question-banks/:id/questions", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    const body = AddQuestionsToBankSchema.parse(request.body);
    return reply.send({ data: await svc.addQuestionsToBank(id, request.organizationId!, body) });
  });

  fastify.delete("/question-banks/:id/questions/:questionId", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    const { questionId } = request.params as { questionId: string };
    return reply.send({ data: await svc.removeQuestionFromBank(id, questionId, request.organizationId!) });
  });

  fastify.patch("/question-banks/:id/questions/reorder", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    const { questionIds } = request.body as { questionIds: string[] };
    return reply.send({ data: await svc.reorderBankQuestions(id, request.organizationId!, questionIds) });
  });

  fastify.post("/question-banks/:id/generate-from-jd", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    const body = GenerateFromJDSchema.parse(request.body);
    return reply.send({ data: await svc.generateFromJD(id, request.organizationId!, body) });
  });

  fastify.post("/question-banks/:id/share", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, CONTENT_ROLES);
    const { id } = IdParamSchema.parse(request.params);
    const { shared } = request.body as { shared: boolean };
    return reply.send({ data: await svc.updateBank(id, request.organizationId!, { isShared: shared }) });
  });
};

export default questionBanksRoutes;
