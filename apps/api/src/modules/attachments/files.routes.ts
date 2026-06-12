import type { FastifyInstance } from "fastify";
import { fileStream } from "../../lib/storage";

// Streams stored files (logos, avatars; later task attachments and proof
// uploads). Keys are server-generated UUIDs, validated in fileStream.
export default async function filesRoutes(app: FastifyInstance) {
  app.get<{ Params: { key: string } }>(
    "/files/:key",
    { preHandler: app.authenticate },
    async (req, reply) => {
      return reply.send(fileStream(req.params.key));
    },
  );
}
