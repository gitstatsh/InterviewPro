import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import { AssessmentUpsertSchema, BulkAssessmentSchema, IdParamSchema } from "@interview/shared";
import * as svc from "./assessments.service.js";

const assessmentsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireOrg = (reply: any, orgId: string | null | undefined): orgId is string => {
    if (!orgId) {
      reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
      return false;
    }
    return true;
  };

  // Full assessment summary for a session
  fastify.get(
    "/sessions/:id/assessment",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!requireOrg(reply, request.organizationId)) return;
      const { id } = IdParamSchema.parse(request.params);
      return reply.send({ data: await svc.getSessionAssessment(id, request.organizationId!) });
    }
  );

  // Upsert single answer assessment
  fastify.put(
    "/answers/:answerId/assessment",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!requireOrg(reply, request.organizationId)) return;
      const { answerId } = request.params as { answerId: string };
      const body = AssessmentUpsertSchema.parse(request.body);
      return reply.send({ data: await svc.upsertAssessment(answerId, request.organizationId!, body) });
    }
  );

  // Bulk upsert assessments for a session
  fastify.post(
    "/sessions/:id/assessments",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!requireOrg(reply, request.organizationId)) return;
      const body = BulkAssessmentSchema.parse(request.body);
      const results = await svc.bulkUpsertAssessments(request.organizationId!, body);
      return reply.send({ data: results });
    }
  );
};

export default assessmentsRoutes;
