import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

/**
 * Reads organization context from x-organization-id header or :orgId URL param.
 * Decorates request.organizationId. Routes that require org context validate it themselves.
 */
const tenantPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("organizationId", null);

  fastify.addHook("onRequest", async (request) => {
    const fromHeader = request.headers["x-organization-id"] as string | undefined;
    const fromParam = (request.params as Record<string, string>)?.orgId;
    request.organizationId = fromHeader ?? fromParam ?? null;
  });
};

export default fp(tenantPlugin, { name: "tenant" });

export async function requireOrganization(request: any, reply: any) {
  if (!request.organizationId) {
    return reply.status(400).send({
      error: { code: "MISSING_ORG", message: "Organization context required" },
    });
  }
}
