import type { FastifyInstance } from "fastify";
import {
  registerPushDeviceSchema,
  unregisterPushDeviceSchema,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";

export default async function pushRoutes(app: FastifyInstance) {
  // The browser needs the VAPID public key to subscribe; null means web
  // push isn't configured on this deployment.
  app.get(
    "/push/vapid-public-key",
    { preHandler: app.authenticate },
    async () => ({ publicKey: env.VAPID_PUBLIC_KEY ?? null }),
  );

  // Registering is an upsert on the token: a token re-registered after the
  // user switches account/organization moves to the current membership.
  app.post(
    "/push-devices",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const input = registerPushDeviceSchema.parse(req.body);
      const device = await prisma.pushDevice.upsert({
        where: { token: input.token },
        create: {
          membershipId: req.auth.membershipId,
          platform: input.platform,
          token: input.token,
          webPushP256dh: input.webPushP256dh,
          webPushAuth: input.webPushAuth,
        },
        update: {
          membershipId: req.auth.membershipId,
          platform: input.platform,
          webPushP256dh: input.webPushP256dh,
          webPushAuth: input.webPushAuth,
        },
      });
      return reply.status(201).send({ id: device.id });
    },
  );

  app.post(
    "/push-devices/unregister",
    { preHandler: app.authenticate },
    async (req) => {
      const input = unregisterPushDeviceSchema.parse(req.body);
      // Scoped to the caller's own memberships — you can't unregister
      // someone else's device by guessing a token.
      const memberships = await prisma.membership.findMany({
        where: { userId: req.auth.userId },
        select: { id: true },
      });
      const result = await prisma.pushDevice.deleteMany({
        where: {
          token: input.token,
          membershipId: { in: memberships.map((m) => m.id) },
        },
      });
      return { removed: result.count };
    },
  );
}
