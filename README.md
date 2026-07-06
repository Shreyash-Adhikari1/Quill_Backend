# Quill

A secure note-sharing and social platform built with Express, Next.js, and MongoDB.

---

## Repositories

| Repository                                                       | Description                              |
| ---------------------------------------------------------------- | ---------------------------------------- |
| [Quill_Security](https://github.com/Shreyash-Adhikari1/Quill_App) | Root repo — Docker setup, compose config |
| [Quill_Backend](https://github.com/Shreyash-Adhikari1/Quill_Backend)   | Express + TypeScript + Mongoose API      |
| [Quill_Frontend](https://github.com/Shreyash-Adhikari1/Quill_Frontend) | Next.js + TypeScript + Tailwind frontend |

---

## Tech Stack

- **Frontend** — Next.js 14, TypeScript, Tailwind CSS
- **Backend** — Express, TypeScript, Mongoose
- **Database** — MongoDB
- **Infrastructure** — Docker, Docker Compose, mkcert (HTTPS)

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Git](https://git-scm.com/)
- [mkcert](https://github.com/FiloSottile/mkcert)

**Windows:** `choco install mkcert`
**Mac:** `brew install mkcert`
**Installing mkcert on Linux:**

```bash
sudo apt install libnss3-tools
wget https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64
sudo mv mkcert-v1.4.4-linux-amd64 /usr/local/bin/mkcert
sudo chmod +x /usr/local/bin/mkcert
```

---

## Setup Instructions

### Step 1 — Clone the root repository

```bash
git clone https://github.com/Shreyash-Adhikari1/Quill_Security
cd Quill_Security
```

### Step 2 — Clone backend and frontend inside the root

```bash
git clone https://github.com/Shreyash-Adhikari1/Quill_Backend
git clone https://github.com/Shreyash-Adhikari1/Quill_Frontend
```

### 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in all values. See `.env.example` for guidance on each variable.

### Step 3 — Generate TLS certificates

HTTPS is required for the application to run correctly. Run the following commands from inside the `Quill_Security` root directory:

```bash
# Install the local certificate authority (only needed once per machine)
mkcert -install

# Create cert directories
mkdir -p Quill_Backend/certs
mkdir -p Quill_Frontend/certs

# Generate certificates for backend
mkcert -key-file Quill_Backend/certs/server.key -cert-file Quill_Backend/certs/server.crt localhost

# Generate certificates for frontend
mkcert -key-file Quill_Frontend/certs/server.key -cert-file Quill_Frontend/certs/server.crt localhost
```

### 4 — Start the application

```bash
docker compose up --build
```

### 5 — Access

| Service      | URL                               |
| ------------ | --------------------------------- |
| Frontend     | https://localhost:3000            |
| Backend API  | https://localhost:5000/api        |
| Health Check | https://localhost:5000/api/health |

---

## Docker Commands

```bash
# Start everything
docker compose up --build

# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and wipe database
docker compose down -v
```

---

## Local Development (without Docker)

**Terminal 1 — Backend:**

```bash
cd Quill_Backend && npm install && npm run dev
```

**Terminal 2 — Frontend:**

```bash
cd Quill_Frontend && npm install && npm run dev
```

Make sure you have Node.js and a local MongoDB instance running. Create separate `.env` files inside each project directory using their respective `.env.example` files.

---

## Project Structure

```
Quill_Security/
├── docker-compose.yml
├── .env.example
├── README.md
├── Quill_Backend/
└── Quill_Frontend/
```
