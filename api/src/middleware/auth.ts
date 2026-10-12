import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JWTPayload } from "../features/auth/dtos/auth.dto.js";

export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";

//declare req.user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET) as JWTPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
