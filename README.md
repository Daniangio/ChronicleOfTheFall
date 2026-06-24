# Echoes of Empire: Chronicle of the Fall

Echoes of Empire is being built as a cooperative narrative strategy game about
an empire whose collapse is inevitable. The current application provides the
authenticated web shell, lobby, social systems, realtime chat, room lifecycle,
and an admin console for preparing the game catalog.

The first game-specific layer is a read-only Chronicle catalog exposed through
admin subpages for tags, cards, minister roles, hidden agendas, and events.
Those catalog endpoints are intentionally separated from the account and
realtime services so persistence and creation workflows can be added next
without mixing game rules into generic infrastructure.

## Stack

- Backend: FastAPI, SQLAlchemy, PostgreSQL, Redis, Firebase Admin SDK.
- Frontend: React, Vite, Firebase Web SDK, Zustand.
- Realtime: WebSocket gateway for presence and chat.
- Deployment: Docker Compose for local development and production.

## Quick Start

1. Copy the env template:

   ```bash
   cp .env.example .env
   ```

2. Fill in Firebase Web SDK values and the backend Firebase project/admin email
   in `.env`.

3. Put the Firebase Admin SDK JSON file at the path configured by
   `FIREBASE_ADMIN_CREDENTIALS`, for example:

   ```text
   secrets/firebase-admin.dev.json
   ```

4. Run the stack:

   ```bash
   docker compose up --build
   ```

5. Open:

   - Frontend: `http://localhost:${FRONTEND_PORT}` from `.env`
   - Backend API: `http://localhost:${BACKEND_PORT}` from `.env`
   - Backend docs: `http://localhost:${BACKEND_PORT}/docs` from `.env`
   - Adminer: `http://localhost:${ADMINER_PORT}` from `.env`

## Validation

```bash
python -m pytest -q
cd frontend && npm install && npm run build
```
