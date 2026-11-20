# Mercora API

Standalone NestJS REST API server for the Mercora B2B Platform.

## Requirements

- Node.js >= 20.x
- npm >= 10.x
- PostgreSQL >= 15 (or SQLite for local development)

## Setup & Installation

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run database migrations or initial seed:
   ```bash
   npm run init:db:local
   ```
4. Start development server:
   ```bash
   npm run start:dev
   ```
   The API will start at `http://localhost:5001`. Swagger documentation is available at `http://localhost:5001/api/docs`.

## Production Build

```bash
npm run build
npm run start:prod
```
