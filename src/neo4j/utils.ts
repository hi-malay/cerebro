import type { Record as Neo4jRecord } from "neo4j-driver";

export function formatMemoryRecords(records: Neo4jRecord[]): string[] {
  const grouped = new Map<
    string,
    {
      sourceName: string;
      sourceKind: string;
      relations: Array<{ type: string; targetName: string; targetKind: string }>;
    }
  >();

  for (const record of records) {
    const sourceName = record.get("sourceName") as string;
    const sourceKind = record.get("sourceKind") as string;
    const relationType = record.get("relationType") as string | null;
    const targetName = record.get("targetName") as string | null;
    const targetKind = record.get("targetKind") as string | null;
    const key = `${sourceKind}:${sourceName}`;

    if (!grouped.has(key)) {
      grouped.set(key, { sourceName, sourceKind, relations: [] });
    }

    if (relationType && targetName && targetKind) {
      grouped.get(key)?.relations.push({ type: relationType, targetName, targetKind });
    }
  }

  return Array.from(grouped.values()).map((record) => JSON.stringify(record));
}
