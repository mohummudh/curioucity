# WonderTalk MVP

Mobile-first web app that turns photos into child-safe, personified voice conversations.

## What is implemented

- Mobile PWA frontend with camera/gallery upload, conversation UI, speech input, parent gate, and offline shell.
- TypeScript API with all core MVP endpoints:
  - `POST /v1/session/create`
  - `POST /v1/photo/upload-url`
  - `PUT /v1/upload/:uploadId?token=...`
  - `POST /v1/photo/analyze`
  - `GET /v1/photo/analyze/:analysisId`
  - `POST /v1/chat/turn`
  - `POST /v1/feedback`
- End-to-end backend pipeline:
  - ingestion validation + image preprocessing + EXIF stripping (`sharp`)
  - vision/entity detection (Gemini multimodal with fallback)
  - deep research fact pack (Gemini with structured citations + cache)
  - persona + hook generation for kids ages 7-10
  - strict moderation for input/output and PII
  - Gemini TTS synthesis (default) with ElevenLabs fallback and audio streaming URLs
  - conversation memory and follow-up orchestration
- Admin/ops endpoints for policy, voices, incidents, and analytics.
- API unit tests for moderation/persona/session behavior.

## Project layout

- `apps/api`: Express + TypeScript backend
- `apps/web`: React + Vite PWA frontend
- `packages/shared`: shared type package scaffold

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Configure environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

3. Add required keys in `apps/api/.env`:

- `GEMINI_API_KEY`
- `ELEVENLABS_API_KEY` (optional fallback)

4. Run API and Web:

```bash
npm run dev
```

- API: `http://localhost:8787`
- Web: `http://localhost:5173`

## Notes on behavior

- If Gemini is unavailable, the app falls back to category-based detection/research templates.
- Voice provider order is controlled by `VOICE_PROVIDER` (`gemini`, `elevenlabs`, or `auto`), default `gemini`.
- External model calls are timeout-limited with `GEMINI_REQUEST_TIMEOUT_MS` and `VOICE_REQUEST_TIMEOUT_MS` to avoid stuck analyses.
- If selected server-side TTS providers are unavailable, text is still returned and browser speech synthesis is used on the client.
- The app enforces strict child-safe moderation before and after generation.
- Uploads/audio are stored locally under `apps/api/data/`.

## MVP limitations (intentional)

- Malware scanning is a stub hook (`ingestionService.malwareScan`) and should be replaced with a real scanner in production.
- Rate limiting is in-memory and keyed by fingerprint/IP; distributed rate limiting and IP reputation feeds are not yet wired.
- Fact validation relies on model output + domain filtering; production should add stronger citation verification and source fetching.

## Test

```bash
npm run test -w @wondertalk/api
```

## Admin snapshot access (from UI)

- Open `Parent` in the top-right, pass the math gate, use the admin key.
- Default key: `parent-mode` (change with `ADMIN_KEY`).
