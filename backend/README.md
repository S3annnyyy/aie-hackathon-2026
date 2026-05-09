# Interior Generation MVP

FastAPI service for PDF-to-3D HDB layout generation.

## Run

```bash
cd interior-generation
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 4190
```

## Key Endpoints

- `POST /api/projects/upload`
- `GET /api/projects/{project_id}`
- `GET /api/projects/{project_id}/layouts`
- `GET /api/layouts/{layout_id}`
- `PATCH /api/layouts/{layout_id}/schema`
- `POST /api/layouts/{layout_id}/schema/fix-from-prompt`
- `POST /api/layouts/{layout_id}/extract`
- `POST /api/layouts/{layout_id}/export-dxf`
- `POST /api/layouts/{layout_id}/generate-glb`
- `POST /api/layouts/{layout_id}/chat` (SSE stream — interior designer agent)
- `GET /api/layouts/{layout_id}/model.glb`

## Notes

- Layout extraction is heuristic-first; schema TODOs are emitted for manual/LLM correction.
- Blender export uses subprocess runtime and the script at `scripts/blender_generate_model.py`.
- If `SUPABASE_DB_URL` is not set, the service runs with an in-memory fallback store.

## Interior Designer Chat (Pascal)

`POST /api/layouts/{layout_id}/chat` streams SSE events (`assistant_text`, `tool_call`,
`tool_result`, `glb_ready`, `done`, `error`, `stream_end`). Frames are standard
`data: {json}\n\n`.

Schema-mutating tool calls (add/move/remove furniture, rename room, set finish) trigger a
GLB regeneration at the end of the turn; the stream emits a `glb_ready` event with the new
`model_url` so the frontend can swap the viewer.

### LLM providers

Pick one via `CHAT_LLM_PROVIDER`:

- `gemini` — uses `GEMINI_MODEL` (default `gemini-2.5-flash`). Requires `GEMINI_API_KEY` (free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
- `openai` — uses `CHAT_OPENAI_MODEL` (defaults to `OPENAI_MODEL`). Requires `OPENAI_API_KEY`.
- `anthropic` — uses `ANTHROPIC_MODEL` (default `claude-opus-4-7`). Requires `ANTHROPIC_API_KEY`.

All three share the same tool schema and vision path, so the agent behaves consistently across providers.

### Blender-MCP (optional, richer tools)

When `BLENDER_MCP_ENABLED=true` and Blender is running locally with the
[blender-mcp](https://github.com/ahujasid/blender-mcp) addon listening on
`BLENDER_MCP_HOST:BLENDER_MCP_PORT` (default `127.0.0.1:9876`), the agent gains tools for
Poly Haven asset search/import and Hyper3D Rodin text-to-3D generation.

Setup:

1. Install Blender 4.x, enable the `blender-mcp` addon.
2. In the addon's sidebar panel, click **Start MCP Server**.
3. Set `BLENDER_MCP_ENABLED=true` in your `.env`.
4. Restart the FastAPI service.

If the addon isn't reachable when a chat turn starts, the agent announces a fallback to
schema-only edits and continues without the MCP tools.

### Demo prompts

- "List the rooms and tell me which one would make the best primary bedroom."
- "Make the living room Scandinavian — cream bouclé sofa, oak coffee table, warm pendant."
- "Rename bedroom 2 to Nursery and add a crib, changing table, and a 1.4m rug."
- "Set the overall finish to japandi and annotate each bedroom with a lighting recipe."
