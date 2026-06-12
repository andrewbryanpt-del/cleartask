import type { FastifyInstance } from "fastify";
import { updateProfileSchema } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { badRequest } from "../../lib/errors";
import { fileUrl, saveFile } from "../../lib/storage";

export default async function usersRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.authenticate }, async (req) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth.userId },
      include: {
        memberships: {
          include: {
            organization: true,
            role: { include: { permissions: true } },
            departments: { select: { id: true, name: true, locationId: true } },
          },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: fileUrl(user.avatarKey),
      organizations: user.memberships.map((m) => ({
        id: m.organizationId,
        name: m.organization.name,
        industry: m.organization.industry,
        logoUrl: fileUrl(m.organization.logoKey),
        onboarded: Boolean(m.organization.onboardedAt),
        membershipId: m.id,
        isOwner: m.isOwner,
        roleName: m.role?.name ?? null,
        permissions: m.role?.permissions.map((p) => p.permission) ?? [],
        departments: m.departments,
      })),
    };
  });

  app.patch("/me", { preHandler: app.authenticate }, async (req) => {
    const input = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.auth.userId },
      data: { name: input.name },
    });
    return { id: user.id, name: user.name };
  });

  app.post("/me/avatar", { preHandler: app.authenticate }, async (req) => {
    const file = await req.file();
    if (!file) throw badRequest("No file uploaded");
    if (!file.mimetype.startsWith("image/")) {
      throw badRequest("Avatar must be an image");
    }
    const key = await saveFile(await file.toBuffer(), file.filename);
    await prisma.user.update({
      where: { id: req.auth.userId },
      data: { avatarKey: key },
    });
    return { avatarUrl: fileUrl(key) };
  });
}
