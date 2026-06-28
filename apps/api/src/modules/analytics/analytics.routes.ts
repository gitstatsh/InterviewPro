import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import { z } from "zod";
import * as svc from "./analytics.service.js";

const DateRangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  preset: z.enum(["7d", "30d", "90d", "180d", "365d"]).optional(),
});

function resolveRange(params: z.infer<typeof DateRangeSchema>): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  if (params.from && params.to) {
    return { from: new Date(params.from), to: new Date(params.to) };
  }

  const days = parseInt(params.preset?.replace("d", "") ?? "30");
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/analytics",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const orgId = request.organizationId;
      if (!orgId) {
        return reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
      }
      const params = DateRangeSchema.parse(request.query);
      const { from, to } = resolveRange(params);
      const { requireRole, ALL_STAFF } = await import("../../lib/rbac.js");
      const requesterRole = await requireRole(orgId, request.user?.id, ALL_STAFF);
      const data = await svc.getOrgAnalytics(orgId, from, to, request.user?.id, requesterRole);
      return reply.send({ data });
    }
  );
};

export default analyticsRoutes;
