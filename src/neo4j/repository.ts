import type { Session } from "neo4j-driver";
import type { ChatTurnPayload } from "../memory/types";
import {
  CREATE_CHAT_MESSAGE,
  LINK_SESSION_TO_MEMORY_NODES,
  MERGE_CHAT_SESSION,
  MERGE_MEMORY_NODES,
  MERGE_MEMORY_RELATIONS,
  SEARCH_CHAT_CONTEXT,
  SEARCH_MEMORY_CONTEXT,
} from "./queries";
import { formatMemoryRecords } from "./utils";

function escapeLucene(query: string): string {
  return query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

export async function saveChatTurn(
  session: Session,
  payload: ChatTurnPayload,
): Promise<void> {
  const createdAt = new Date().toISOString();
  const messageId = crypto.randomUUID();

  const tx = session.beginTransaction();
  try {
    await tx.run(MERGE_CHAT_SESSION, {
      sessionId: payload.sessionId,
      createdAt,
    });
    await tx.run(CREATE_CHAT_MESSAGE, {
      sessionId: payload.sessionId,
      messageId,
      question: payload.question,
      answer: payload.answer,
      toolsUsed: payload.toolsUsed,
      createdAt,
    });

    if (payload.memoryGraph.entities.length > 0) {
      await tx.run(MERGE_MEMORY_NODES, {
        entities: payload.memoryGraph.entities,
        createdAt,
      });
      if (payload.memoryGraph.relations.length > 0) {
        await tx.run(MERGE_MEMORY_RELATIONS, {
          relations: payload.memoryGraph.relations,
          createdAt,
        });
      }
      await tx.run(LINK_SESSION_TO_MEMORY_NODES, {
        sessionId: payload.sessionId,
        entities: payload.memoryGraph.entities,
      });
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function searchGraphContext(
  session: Session,
  question: string,
): Promise<string> {
  const query = escapeLucene(question.trim());
  if (!query) return "";

  const chatResult = await session.run(SEARCH_CHAT_CONTEXT, { query });
  const chatRecords = chatResult.records.map((record) =>
    JSON.stringify({
      source: "chat",
      sessionId: record.get("sessionId"),
      question: record.get("question"),
      answer: record.get("answer"),
      toolsUsed: record.get("toolsUsed"),
      createdAt: record.get("createdAt"),
    }),
  );

  const memoryResult = await session.run(SEARCH_MEMORY_CONTEXT, { query });
  const memoryRecords = formatMemoryRecords(memoryResult.records).map(
    (record) =>
      JSON.stringify({
        source: "memory",
        ...JSON.parse(record),
      }),
  );

  return [...memoryRecords, ...chatRecords].join("\n");
}
