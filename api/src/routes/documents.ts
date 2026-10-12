import { NextFunction, Request, Response, Router } from "express";
import { MulterError } from "multer";
import {
  deleteDocument,
  getDocument,
  listDocuments,
  uploadDocument,
} from "../features/document/controllers/document.controller..js";
import {
  getDocumentFile,
  getReview,
  saveReview,
} from "../features/extraction/controllers/review.controller.js";
import { uploadMiddleware } from "../features/document/utils/storage.util.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/", uploadMiddleware.single("file"), uploadDocument);
router.get("/", listDocuments);
router.get("/:id", getDocument);
router.get("/:id/file", getDocumentFile);
router.get("/:id/review", getReview);
router.patch("/:id/review", saveReview);
router.delete("/:id", deleteDocument);

// Multer rejects (e.g. the size limit) surface as thrown errors rather than as
// a normal response, so without this handler they'd come back as a generic 500.
router.use(
  (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "File is too large (max 25MB)"
          : error.message;
      return res.status(400).json({ error: message });
    }
    next(error);
  },
);

export default router;
