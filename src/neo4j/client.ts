import neo4j, { type Driver, type Session } from "neo4j-driver";
import { config } from "../config/env.js";
import {
  ENSURE_CHAT_MESSAGE_CONSTRAINT,
  ENSURE_MEMORY_NODE_CONSTRAINT,
  CREATE_CHAT_FULLTEXT_INDEX,
  CREATE_MEMORY_FULLTEXT_INDEX,
} from "./queries.js";

let driver: Driver | null = null;
let connected = false;

function openSession(): Session {
  if (!driver) throw new Error("Neo4j driver not initialized");
  return config.neo4jDatabase
    ? driver.session({ database: config.neo4jDatabase })
    : driver.session();
}

export async function initNeo4j(): Promise<void> {
  try {
    if (config.neo4jUrl && config.neo4jUser && config.neo4jPassword) {
      driver = neo4j.driver(
        config.neo4jUrl,
        neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
      );
      await driver.getServerInfo();
      connected = true;

      // One-shot session for startup constraints/indexes
      const session = openSession();
      try {
        await session.run(ENSURE_CHAT_MESSAGE_CONSTRAINT);
        await session.run(ENSURE_MEMORY_NODE_CONSTRAINT);
        await session.run(CREATE_CHAT_FULLTEXT_INDEX);
        await session.run(CREATE_MEMORY_FULLTEXT_INDEX);
      } finally {
        await session.close();
      }

      console.log(
        `Neo4j connected${config.neo4jDatabase ? ` (database: ${config.neo4jDatabase})` : " (using home database)"}.`,
      );
    }
  } catch (e: any) {
    console.log(
      `Neo4j unavailable (${e.message}). Running without knowledge graph.`,
    );
  }
}

export function isConnected(): boolean {
  return connected;
}

// Neo4j sessions are not safe for concurrent statements.
// Always open a fresh session per request via this helper.
export async function withSession<T>(
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const session = openSession();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

export async function shutdown(): Promise<void> {
  if (driver) await driver.close();
}
