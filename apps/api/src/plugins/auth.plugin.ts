import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { auth } from "../lib/auth.js";

/**
 * Validates session on every request. Decorates request.user and request.session.
 * Does NOT reject unauthenticated requests — routes opt in with requireAuth preHandler.
 */
const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("user", null);
  fastify.decorateRequest("session", null);

  fastify.addHook("onRequest", async (request) => {
    try {
      const session = await auth.api.getSession({
        headers: request.headers as unknown as Headers,
      });
      if (session) {
        request.user = session.user as any;
        request.session = session.session as any;
      }
    } catch {
      // No session — user stays null
    }
  });
};

export default fp(authPlugin, { name: "auth" });

export async function requireAuth(request: any, reply: any) {
  if (!request.user) {
    return reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }
}
