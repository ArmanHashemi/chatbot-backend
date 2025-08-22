# Chatbot Backend

Node.js Express backend colocated with the frontend in `backend/`.

## Features
- Express server with CORS, JSON, logging (morgan)
- Health endpoint: `GET /` and `GET /api/health`
- Placeholder `POST /api/chat` endpoint to be implemented per your specs
- Environment variables via dotenv

## Getting Started

```bash
# 1) go to backend folder
cd backend

# 2) copy env file
cp .env.example .env

# 3) install deps
npm install

# 4) run in dev with auto-reload
npm run dev

# or run in prod mode
npm start
```

Default server runs on: `http://localhost:3001`

CORS allows frontend origin: `http://localhost:5173` (Vite/Quasar default). Adjust `FRONTEND_ORIGIN` in `.env` if needed.

## Endpoints
- `GET /` => health info
- `GET /api/health` => `{ status: 'ok' }`
- `POST /api/chat` => sample response; expects `{ message, conversationId? }`

## Next Steps
Provide backend requirements (LLM provider, DB, auth, file uploads, references logic). I'll wire them up here.
