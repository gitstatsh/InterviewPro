import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import { IdParamSchema } from "@interview/shared";
import * as svc from "./summaries.service.js";

const summariesRoutes: FastifyPluginAsync = async (fastify) => {
  const requireOrg = (reply: any, orgId: string | null | undefined): orgId is string => {
    if (!orgId) {
      reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
      return false;
    }
    return true;
  };

  // Trigger async summary generation
  fastify.post(
    "/sessions/:id/summary/generate",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!requireOrg(reply, request.organizationId)) return;
      const { id } = IdParamSchema.parse(request.params);
      const result = await svc.enqueueSummary(id, request.organizationId!);
      return reply.status(202).send({ data: result });
    }
  );

  // Get summary status / result
  fastify.get(
    "/sessions/:id/summary",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!requireOrg(reply, request.organizationId)) return;
      const { id } = IdParamSchema.parse(request.params);
      return reply.send({ data: await svc.getSummary(id, request.organizationId!) });
    }
  );
};

export default summariesRoutes;
