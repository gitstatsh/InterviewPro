import { User, Session } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
    session: Session | null;
    organizationId: string | null;
  }
}
