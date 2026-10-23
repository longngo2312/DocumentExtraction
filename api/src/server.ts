// First: checks the environment before any module reads it.
import "./env.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { startWorker } from "./features/extraction/worker.js";
import authRoutes from "./routes/auth.js";
import documentRoutes from "./routes/documents.js";
import queryRoutes from "./routes/query.js";

import schemaRoutes from "./routes/schema.js";
const app = express();
const PORT = Number(process.env.PORT);

//middleware
// credentials:true is what lets the browser send the refresh cookie. It only
// works alongside an explicit origin — "*" is rejected once credentials are on.
// CORS_ORIGIN is the frontend's own address, exactly as the browser shows it.
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

//Routes
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});
app.use("/api/auth", authRoutes);
app.use("/api/schemas", schemaRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/query", queryRoutes);

//worker
startWorker();
app.listen(PORT, () => {
  console.log("App listening at PORT", PORT);
});
