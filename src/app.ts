import express from "express";
import cors from "cors";
import { initNeo4j } from "./neo4j/client.js";
import chatRouter from "./routes/chat.js";
import pdfRouter from "./routes/pdf.js";
import sessionRouter from "./routes/session.js";
import statusRouter from "./routes/status.js";

await initNeo4j();

const app = express();
app.use(cors());
app.use(express.json());

app.use(statusRouter);
app.use(chatRouter);
app.use(pdfRouter);
app.use(sessionRouter);

export default app;
