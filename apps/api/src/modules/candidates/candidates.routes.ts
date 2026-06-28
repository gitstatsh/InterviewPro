import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import {
  CandidateCreateSchema,
  CandidateUpdateSchema,
  CandidateListSchema,
  CandidateCSVRowSchema,
  IdParamSchema,
} from "@interview/shared";
import * as svc from "./candidates.service.js";
import { requireRole, HR_AND_ABOVE, ALL_STAFF } from "../../lib/rbac.js";

const candidatesRoutes: FastifyPluginAsync = async (fastify) => {
  const requireOrg = (reply: any, orgId: string | null | undefined) => {
    if (!orgId) {
      reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
      return false;
    }
    return true;
  };

  // Read: all org members
  fastify.get("/candidates", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const params = CandidateListSchema.parse(request.query);
    return reply.send(await svc.listCandidates(request.organizationId!, params));
  });

  fastify.get("/candidates/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.getCandidate(id, request.organizationId!) });
  });

  // Write: OWNER, ADMIN, ORG_HR only
  fastify.post("/candidates", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const body = CandidateCreateSchema.parse(request.body);
    return reply.status(201).send({ data: await svc.createCandidate(request.organizationId!, body) });
  });

  fastify.patch("/candidates/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const { id } = IdParamSchema.parse(request.params);
    const body = CandidateUpdateSchema.parse(request.body);
    return reply.send({ data: await svc.updateCandidate(id, request.organizationId!, body) });
  });

  fastify.delete("/candidates/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const { id } = IdParamSchema.parse(request.params);
    await svc.deleteCandidate(id, request.organizationId!);
    return reply.status(204).send();
  });

  fastify.post("/candidates/import", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const { rows } = request.body as { rows: any[] };
    if (!Array.isArray(rows) || rows.length === 0)
      return reply.status(400).send({ error: { code: "EMPTY_ROWS", message: "No rows provided" } });
    if (rows.length > 500)
      return reply.status(400).send({ error: { code: "TOO_MANY_ROWS", message: "Maximum 500 rows per import" } });
    const parsed: any[] = [];
    const parseErrors: string[] = [];
    rows.forEach((row, i) => {
      const result = CandidateCSVRowSchema.safeParse(row);
      if (result.success) parsed.push(result.data);
      else parseErrors.push(`Row ${i + 1}: ${result.error.issues.map((e) => e.message).join(", ")}`);
    });
    if (parseErrors.length > 0)
      return reply.status(422).send({ error: { code: "VALIDATION_ERRORS", message: "Some rows failed validation", details: parseErrors } });
    return reply.status(201).send({ data: await svc.importCandidatesFromCSV(request.organizationId!, parsed) });
  });
};

export default candidatesRoutes;
