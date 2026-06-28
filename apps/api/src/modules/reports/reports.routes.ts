import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../plugins/auth.plugin.js";
import { IdParamSchema } from "@interview/shared";
import { z } from "zod";
import * as svc from "./reports.service.js";
import { requireRole, ALL_STAFF, HR_AND_ABOVE } from "../../lib/rbac.js";

const EmailReportSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(10),
});

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireOrg = (reply: any, orgId: string | null | undefined): orgId is string => {
    if (!orgId) {
      reply.status(400).send({ error: { code: "MISSING_ORG", message: "Organization context required" } });
      return false;
    }
    return true;
  };

  // View report: all members
  fastify.get("/sessions/:id/report", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    return reply.send({ data: await svc.getReportData(id, request.organizationId!) });
  });

  // Download PDF: all members
  fastify.get("/sessions/:id/report/pdf", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, ALL_STAFF);
    const { id } = IdParamSchema.parse(request.params);
    const pdf = await svc.generateReportPDF(id, request.organizationId!);
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="interview-report-${id.slice(-8)}.pdf"`)
      .header("Content-Length", pdf.length);
    return reply.send(pdf);
  });

  // Email report: OWNER, ADMIN, ORG_HR only
  fastify.post("/sessions/:id/report/email", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!requireOrg(reply, request.organizationId)) return;
    await requireRole(request.organizationId!, request.user!.id!, HR_AND_ABOVE);
    const { id } = IdParamSchema.parse(request.params);
    const { recipients } = EmailReportSchema.parse(request.body);
    return reply.send({ data: await svc.emailReport(id, request.organizationId!, recipients) });
  });
};

export default reportsRoutes;
