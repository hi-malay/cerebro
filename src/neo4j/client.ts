import neo4j, { type Driver, type Session } from "neo4j-driver";
import { config } from "../config/env.js";
import {
  ENSURE_CHAT_MESSAGE_CONSTRAINT,
  ENSURE_MEMORY_NODE_CONSTRAINT,
  CREATE_CHAT_FULLTEXT_INDEX,
  CREATE_MEMORY_FULLTEXT_INDEX,
} from "./queries.js";

let driver: Driver | null = null;
let session: Session | null = null;
let connected = false;

export async function initNeo4j(): Promise<void> {
  try {
    if (config.neo4jUrl && config.neo4jUser && config.neo4jPassword) {
      driver = neo4j.driver(
        config.neo4jUrl,
        neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
      );
      await driver.getServerInfo();
      session = config.neo4jDatabase
        ? driver.session({ database: config.neo4jDatabase })
        : driver.session();
      connected = true;

      // Create constraints and indexes once at startup
      await session.run(ENSURE_CHAT_MESSAGE_CONSTRAINT);
      await session.run(ENSURE_MEMORY_NODE_CONSTRAINT);
      await session.run(CREATE_CHAT_FULLTEXT_INDEX);
      await session.run(CREATE_MEMORY_FULLTEXT_INDEX);

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

export function getSession(): Session | null {
  return session;
}

export async function shutdown(): Promise<void> {
  if (session) await session.close();
  if (driver) await driver.close();
}
