import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { extractionLlm } from "../llm/client.js";
import type { MemoryEntity, MemoryGraph } from "./types.js";

const EMPTY_GRAPH: MemoryGraph = { entities: [], relations: [] };

const EXTRACTION_PROMPT = `You are a memory extraction system. You receive a conversation turn (user message + assistant response) and optionally prior chat history for context.

Return a JSON object with this exact schema:
{
  "entities": [
    {"kind": "Person|Organization|Location|Skill|Interest|Profession|Event|Other", "name": "exact name"}
  ],
  "relations": [
    {"from": "entity name", "type": "WORKS_AT|LIVES_IN|KNOWS|LIKES|HAS_SKILL|STUDIED_AT|HAS_PROFESSION|MEMBER_OF|RELATED_TO", "to": "entity name"}
  ]
}

Rules:
- Extract ONLY facts explicitly stated. Never infer or guess.
- The "from" entity in relations is usually the user (Person).
- If the user's name was mentioned in chat history, include a Person entity for them and use their name as the "from" in relations.
- If no name is known but the user expresses preferences or facts about themselves, use "User" as the Person entity name.
- If no personal facts or entities are present, return {"entities": [], "relations": []}.
- Return ONLY the JSON object. No markdown, no explanation.`;

function normalizeEntity(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createEntityKey(kind: string, name: string): string {
  return `${kind.toLowerCase()}:${normalizeEntity(name).toLowerCase()}`;
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export async function extractMemoryGraph(
  question: string,
  answer: string,
  chatHistory?: string,
): Promise<MemoryGraph> {
  try {
    let userMessage = "";
    if (chatHistory?.trim()) {
      userMessage += `Chat history:\n${chatHistory}\n\n`;
    }
    userMessage += `Current turn:\nUser: ${question}\nAssistant: ${answer}`;

    const response = await extractionLlm.invoke([
      new SystemMessage(EXTRACTION_PROMPT),
      new HumanMessage(userMessage),
    ]);

    const text = (response.content as string).trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return EMPTY_GRAPH;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.entities)) return EMPTY_GRAPH;

    const entities: MemoryEntity[] = parsed.entities
      .filter((e: any) => e.kind && e.name)
      .map((e: any) => {
        const name = e.kind === "Person" ? toTitleCase(e.name) : normalizeEntity(e.name);
        return {
          key: createEntityKey(e.kind, name),
          kind: e.kind,
          name,
        };
      });

    const relations = (parsed.relations || [])
      .filter((r: any) => r.from && r.type && r.to)
      .map((r: any) => {
        const fromEntity = entities.find(
          (e) => e.name.toLowerCase() === r.from.toLowerCase(),
        );
        const toEntity = entities.find(
          (e) => e.name.toLowerCase() === r.to.toLowerCase(),
        );
        if (!fromEntity || !toEntity) return null;
        return {
          fromKey: fromEntity.key,
          toKey: toEntity.key,
          type: r.type,
        };
      })
      .filter(Boolean);

    return { entities, relations };
  } catch (e: any) {
    console.warn("Memory extraction failed:", e.message);
    return EMPTY_GRAPH;
  }
}
