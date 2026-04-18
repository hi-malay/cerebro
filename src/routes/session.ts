import { Router } from "express";
import { sessions } from "./chat";

const router = Router();

router.delete("/session/:sessionId", (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ message: "Session cleared" });
});

export default router;
