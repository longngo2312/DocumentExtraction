import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { startWorker } from "./features/extraction/worker.js";
import authRoutes from "./routes/auth.js";
import documentRoutes from "./routes/documents.js";

import schemaRoutes from "./routes/schema.js";
const app = express();
const PORT = 3000;

//middleware
// credentials:true is what lets the browser send the refresh cookie. It only
// works alongside an explicit origin — "*" is rejected once credentials are on.
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

//Routes
app.use((req, _res, next) => {
  console.log(req.method, req.url);
  next();
});
app.use("/api/auth", authRoutes);
app.use("/api/schemas", schemaRoutes);
app.use("/api/documents", documentRoutes);

//worker
startWorker();
app.listen(PORT, () => {
  console.log("App listening at PORT", PORT);
});
