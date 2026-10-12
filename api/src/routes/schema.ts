import { Router } from "express";
import {
  createSchema,
  deleteSchema,
  getAllSchemas,
  getSchemaDetails,
  updateSchema,
} from "../features/schema/controllers/schema.controller..js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
//middleware here before hitting any routes
router.use(requireAuth);

router.post("/", createSchema);
router.get("/", getAllSchemas);
router.get("/:id", getSchemaDetails);
router.put("/:id", updateSchema);
router.delete("/:id", deleteSchema);

export default router;
