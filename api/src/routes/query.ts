import { Router } from "express";
import {
  deleteChatSession,
  getChatSession,
  getQueryStatus,
  indexMissing,
  listChatSessions,
  postQuery,
} from "../features/RAG/controllers/query.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/", postQuery);
router.get("/status", getQueryStatus);
router.post("/index", indexMissing);
router.get("/sessions", listChatSessions);
router.get("/sessions/:id", getChatSession);
router.delete("/sessions/:id", deleteChatSession);

export default router;
