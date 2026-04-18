import express from "express";
import cors from "cors";
import { initNeo4j } from "./neo4j/client";
import chatRouter from "./routes/chat";
import pdfRouter from "./routes/pdf";
import sessionRouter from "./routes/session";
import statusRouter from "./routes/status";

await initNeo4j();

const app = express();
app.use(cors());
app.use(express.json());

app.use(statusRouter);
app.use(chatRouter);
app.use(pdfRouter);
app.use(sessionRouter);

export default app;
