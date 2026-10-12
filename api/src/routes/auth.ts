import { Router } from "express";
import {
  login,
  logout,
  refresh,
  register,
} from "../features/auth/controllers/auth.contoller.js";
const router = Router();

router.post("/register", register);
router.post("/login", login);
// Both authenticate via the refresh cookie, so neither uses requireAuth —
// the whole point is that they work once the access token has expired.
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
