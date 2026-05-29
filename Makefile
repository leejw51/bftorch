# PyTorch Sandbox — Makefile
# Backend: Python + PyTorch + FastAPI (JSON API).  Frontend: TypeScript + Three.js (Vite).

VENV    := .venv
PY      := $(VENV)/bin/python
PIP     := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
PORT    ?= 8200
RUN_DIR := .run
# Tell the Vite dev-server proxy which backend port to target (keeps them in sync).
export BACKEND_PORT = $(PORT)

.DEFAULT_GOAL := help
.PHONY: help install install-backend install-frontend start stop restart test backend frontend dev build clean

help:
	@echo "PyTorch Sandbox"
	@echo "  make           - show this help"
	@echo "  make install   - set up Python venv + backend deps, and frontend npm deps"
	@echo "  make start     - start backend (:$(PORT)) and frontend (:5173) in the background"
	@echo "  make stop      - stop backend and frontend"
	@echo "  make restart   - stop then start"
	@echo "  make test      - run backend smoke tests + frontend build"
	@echo "  make build     - production build of the frontend"
	@echo "  make clean     - remove venv, node_modules, build output and run state"
	@echo ""
	@echo "  (dev helpers: 'make backend' / 'make frontend' run a single service in the foreground)"

install: install-backend install-frontend
	@echo "✅ Install complete. Run 'make start' and open http://localhost:5173"

install-backend:
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt

install-frontend:
	cd frontend && npm install

# --- start / stop (background) ------------------------------------------- #
start:
	@mkdir -p $(RUN_DIR)
	@echo "▶  starting backend on :$(PORT) ..."
	@$(UVICORN) backend.app:app --port $(PORT) > $(RUN_DIR)/backend.log 2>&1 & echo $$! > $(RUN_DIR)/backend.pid
	@echo "▶  starting frontend on :5173 ..."
	@cd frontend && npm run dev > ../$(RUN_DIR)/frontend.log 2>&1 & echo $$! > $(RUN_DIR)/frontend.pid
	@echo "✅ started — backend :$(PORT), frontend http://localhost:5173"
	@echo "   logs: $(RUN_DIR)/backend.log, $(RUN_DIR)/frontend.log   |   stop: make stop"

stop:
	@-[ -f $(RUN_DIR)/backend.pid ]  && kill `cat $(RUN_DIR)/backend.pid`  2>/dev/null || true
	@-[ -f $(RUN_DIR)/frontend.pid ] && kill `cat $(RUN_DIR)/frontend.pid` 2>/dev/null || true
	@-pkill -f "uvicorn backend.app" 2>/dev/null || true
	@-pkill -f "vite" 2>/dev/null || true
	@rm -f $(RUN_DIR)/backend.pid $(RUN_DIR)/frontend.pid
	@echo "🛑 stopped"

restart: stop start

# --- test ----------------------------------------------------------------- #
test:
	@echo "🧪 backend smoke tests ..."
	$(PY) -m tests.test_smoke
	@echo "🧪 frontend build / typecheck ..."
	cd frontend && npm run build
	@echo "✅ tests passed"

# --- single-service dev helpers (foreground) ------------------------------ #
backend:
	$(UVICORN) backend.app:app --reload --port $(PORT)

frontend:
	cd frontend && npm run dev

dev:
	@$(MAKE) -j2 backend frontend

build:
	cd frontend && npm run build

clean: stop
	rm -rf $(VENV) frontend/node_modules frontend/dist $(RUN_DIR)
	@echo "🧹 cleaned"
