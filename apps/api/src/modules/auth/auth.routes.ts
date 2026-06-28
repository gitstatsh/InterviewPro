import type { FastifyPluginAsync } from "fastify";
import { auth } from "../../lib/auth.js";
import { requireAuth } from "../../plugins/auth.plugin.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Auth routes delegate to Better Auth for core operations.
 * Custom /me route returns the authenticated user profile.
 */
async function betterAuthHandler(request: any, reply: any) {
  const response = await auth.handler(
    new Request(
      `${request.protocol}://${request.hostname}${request.url}`,
      {
        method: request.method,
        headers: request.headers as unknown as HeadersInit,
        body:
          request.method !== "GET" && request.method !== "HEAD"
            ? JSON.stringify(request.body)
            : undefined,
      }
    )
  );

  reply.status(response.status);
  response.headers.forEach((value: string, key: string) => {
    reply.header(key, value);
  });
  const body = await response.text();
  return reply.send(body);
}

/**
 * Mounts Better Auth at its native /api/auth/* path, and custom routes under /api/v1.
 */
const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Better Auth native routes: /api/auth/sign-up/email, /api/auth/sign-in/email, etc.
  fastify.all("/api/auth/*", betterAuthHandler);

  // GET /api/v1/me — returns current user + org memberships
  fastify.get(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user!.id },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          organizationMembers: {
            select: {
              role: true,
              organization: {
                select: { id: true, name: true, slug: true, logo: true },
              },
            },
          },
        },
      });

      return reply.send({ data: user });
    }
  );

  // GET /api/v1/health
  fastify.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });
};

export default authRoutes;
