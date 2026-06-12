import fp from "fastify-plugin";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

export default fp(async (app) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation failed",
        issues: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    const httpError = err as { statusCode?: number; message?: string };
    if (
      typeof httpError.statusCode === "number" &&
      httpError.statusCode < 500
    ) {
      return reply
        .status(httpError.statusCode)
        .send({ error: httpError.message ?? "Request failed" });
    }
    req.log.error(err);
    return reply.status(500).send({ error: "Internal server error" });
  });
});
