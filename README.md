# Cerebro

Agentic AI backend that thinks before it answers. Uses a ReAct (Reason + Act) loop — the LLM can search the web, do math, and re-query PDFs on its own before responding.

Built with LangGraph, Groq (Llama 3.3 70B), Qdrant, and Neo4j.

## How it works

```
User question
     │
     ▼
  Retrieve (Qdrant vector search + Neo4j graph query)
     │
     ▼
  Agent reasons ──── has enough info? ──── YES → answer
     │                                        
     NO (needs more)                          
     │                                        
     ▼                                        
  Use a tool:                                 
  • web_search — DuckDuckGo                   
  • calculator — math expressions             
  • search_pdf — re-search with better query  
     │                                        
     └──── feed result back → agent reasons again (up to 5 loops)
```

The agent decides which tools to use and when. No hardcoded `if/else` — the LLM figures it out from context.

## Stack

- **LangGraph** — state machine for the ReAct pipeline
- **Groq** — LLM inference (Llama 3.3 70B)
- **Qdrant** — vector database for PDF similarity search
- **Neo4j** — knowledge graph (optional)
- **HuggingFace Transformers** — local embeddings (all-MiniLM-L6-v2)
- **Express** — REST API
- **TypeScript**

## Setup

```bash
# 1. Start Qdrant
docker compose -f ../agentic_ai/docker-compose.yml up -d

# 2. Install
npm install

# 3. Environment variables
cp .env.example .env
# fill in GROQ_API_KEY (required), NEO_* (optional)

# 4. Run
npm run dev
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/status` | Server state — RAG, Neo4j, sessions, tools |
| `POST` | `/chat` | Send a question (plain or RAG) |
| `POST` | `/upload-pdf` | Upload PDF to enable RAG mode |
| `POST` | `/reset-rag` | Disable RAG, back to plain chat |
| `DELETE` | `/session/:id` | Clear a session's chat history |

### POST /chat

```json
// Request
{ "question": "What is 15% of 4200?", "session_id": null }

// Response
{
  "answer": "15% of 4200 is 630.",
  "session_id": "abc-123",
  "rag_enabled": false,
  "tools_used": ["calculator"],
  "iterations": 2
}
```

Omit `session_id` to start a new session. Pass it back for follow-up questions.

### POST /upload-pdf

`multipart/form-data` with a `file` field.

```json
// Response
{
  "message": "PDF loaded successfully",
  "filename": "paper.pdf",
  "chunks": 42,
  "rag_enabled": true
}
```

## Tools

The agent has 3 tools it can choose to use:

| Tool | When the agent uses it |
|------|----------------------|
| `web_search` | Needs current info, external facts, or PDF lacks the answer |
| `calculator` | Math involved — LLMs can't compute, so they delegate |
| `search_pdf` | Initial PDF search wasn't specific enough, retries with refined keywords |

Tool calling is **prompt-based** — the LLM outputs `{"tool": "name", "args": {...}}` as JSON, we parse and execute it. This works with any model (no API-level tool calling required).

## .env

```
GROQ_API_KEY=your_key_here       # required
NEO_URL=neo4j+s://...            # optional
NEO_USER=your_user               # optional
NEO_PASSWORD=your_password       # optional
PORT=8001                        # default 8000
```

Neo4j is optional — server starts and works without it.

## Python version

There's a matching Python implementation at `../agentic_ai/` using FastAPI + the same architecture. Both versions share the same API contract and Postman collection.
