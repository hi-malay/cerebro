// --- Constraints ---

export const ENSURE_CHAT_MESSAGE_CONSTRAINT =
  "CREATE CONSTRAINT chat_message_id IF NOT EXISTS FOR (m:ChatMessage) REQUIRE m.id IS UNIQUE";

export const ENSURE_MEMORY_NODE_CONSTRAINT =
  "CREATE CONSTRAINT memory_node_key IF NOT EXISTS FOR (n:MemoryNode) REQUIRE n.key IS UNIQUE";

// --- Full-text indexes (replace toLower + CONTAINS scans) ---

export const CREATE_CHAT_FULLTEXT_INDEX = `
  CREATE FULLTEXT INDEX chat_message_text IF NOT EXISTS
  FOR (m:ChatMessage)
  ON EACH [m.question, m.answer]
`;

export const CREATE_MEMORY_FULLTEXT_INDEX = `
  CREATE FULLTEXT INDEX memory_node_text IF NOT EXISTS
  FOR (n:MemoryNode)
  ON EACH [n.name]
`;

// --- Chat session & message writes ---

export const MERGE_CHAT_SESSION =
  "MERGE (s:ChatSession {id: $sessionId}) SET s.updatedAt = $createdAt";

export const CREATE_CHAT_MESSAGE = `
  MATCH (s:ChatSession {id: $sessionId})
  CREATE (m:ChatMessage {
    id: $messageId,
    question: $question,
    answer: $answer,
    toolsUsed: $toolsUsed,
    createdAt: $createdAt
  })
  CREATE (s)-[:HAS_MESSAGE]->(m)
`;

// --- Memory graph writes ---

export const MERGE_MEMORY_NODES = `
  UNWIND $entities AS entity
  MERGE (node:MemoryNode {key: entity.key})
  SET node.kind = entity.kind,
      node.name = entity.name,
      node.updatedAt = $createdAt
`;

export const MERGE_MEMORY_RELATIONS = `
  UNWIND $relations AS relation
  MATCH (source:MemoryNode {key: relation.fromKey})
  MATCH (target:MemoryNode {key: relation.toKey})
  MERGE (source)-[r:MEMORY_RELATION {
    type: relation.type,
    fromKey: relation.fromKey,
    toKey: relation.toKey
  }]->(target)
  SET r.updatedAt = $createdAt
`;

export const LINK_SESSION_TO_MEMORY_NODES = `
  MATCH (s:ChatSession {id: $sessionId})
  WITH s
  UNWIND $entities AS entity
  MATCH (node:MemoryNode {key: entity.key})
  MERGE (s)-[:ABOUT]->(node)
`;

// --- Search queries (full-text indexed) ---

export const SEARCH_CHAT_CONTEXT = `
  CALL db.index.fulltext.queryNodes('chat_message_text', $query)
  YIELD node AS m, score
  MATCH (s:ChatSession)-[:HAS_MESSAGE]->(m)
  RETURN s.id AS sessionId, m.question AS question, m.answer AS answer,
         m.toolsUsed AS toolsUsed, m.createdAt AS createdAt
  ORDER BY score DESC
  LIMIT 5
`;

export const SEARCH_MEMORY_CONTEXT = `
  CALL db.index.fulltext.queryNodes('memory_node_text', $query)
  YIELD node AS source, score
  OPTIONAL MATCH (source)-[rel:MEMORY_RELATION]->(target:MemoryNode)
  RETURN source.name AS sourceName, source.kind AS sourceKind,
         rel.type AS relationType, target.name AS targetName, target.kind AS targetKind
  ORDER BY score DESC
  LIMIT 10
`;
