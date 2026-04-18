export type MemoryEntity = {
  key: string;
  kind: string;
  name: string;
};

export type MemoryRelation = {
  fromKey: string;
  toKey: string;
  type: string;
};

export type MemoryGraph = {
  entities: MemoryEntity[];
  relations: MemoryRelation[];
};

export type ChatTurnPayload = {
  sessionId: string;
  question: string;
  answer: string;
  toolsUsed: string[];
  memoryGraph: MemoryGraph;
};
