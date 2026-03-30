import { Router } from "express";

export function createHealthRoutes() {
  const router = Router();

  router.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return router;
}
