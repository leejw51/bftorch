# PyTorch Sandbox — Makefile
# Backend: Python + PyTorch + FastAPI (JSON API).  Frontend: TypeScript + Three.js (Vite).
#
# Two worlds live here:
#   * Dev      — run the two halves from source (make start / dev / backend / frontend).
#   * Packaging — bundle everything into a single native macOS app: `make package`
#                 builds ./bftorch.dmg (pyapp-packaged server + Tauri window shell).
#                 macOS / Apple Silicon only for now.

VENV    := .venv
PY      := $(VENV)/bin/python
PIP     := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
PORT    ?= 8200
RUN_DIR := .run
# Tell the Vite dev-server proxy which backend port to target (keeps them in sync).
export BACKEND_PORT = $(PORT)

# --- Debug / external-access mode (USE_BFTORCH_DEBUG=true) ----------------- #
# Off by default: both halves bind to loopback only. Turn it on to make the
# backend (:$(PORT)) and frontend (:5173) reachable from *other computers* on
# the LAN (binds 0.0.0.0) and — unless BFTORCH_HTTPS=false — serve them over a
# self-signed HTTPS cert kept in $(RUN_DIR)/tls/. Detection of the LAN IP, the
# cert, and the "open this elsewhere" banner all live in backend/netdbg.py
# (stdlib-only, so plain python3 is fine here).
NETDBG   := python3 -m backend.netdbg
TLS_DIR  := $(RUN_DIR)/tls
TLS_CERT := $(TLS_DIR)/cert.pem
TLS_KEY  := $(TLS_DIR)/key.pem

ifeq ($(USE_BFTORCH_DEBUG),true)
  BIND_HOST := 0.0.0.0
  ifeq ($(BFTORCH_HTTPS),false)
    DEBUG_HTTPS :=
  else
    DEBUG_HTTPS := 1
  endif
else
  BIND_HOST := 127.0.0.1
  DEBUG_HTTPS :=
endif

ifeq ($(DEBUG_HTTPS),1)
  UVICORN_TLS := --ssl-certfile $(TLS_CERT) --ssl-keyfile $(TLS_KEY)
else
  UVICORN_TLS :=
endif

# Consumed by frontend/vite.config.ts (it can't see the make conditionals).
export BFTORCH_DEBUG    := $(if $(filter true,$(USE_BFTORCH_DEBUG)),1,)
export BFTORCH_HTTPS    := $(DEBUG_HTTPS)
export BFTORCH_TLS_CERT := $(if $(DEBUG_HTTPS),$(abspath $(TLS_CERT)),)
export BFTORCH_TLS_KEY  := $(if $(DEBUG_HTTPS),$(abspath $(TLS_KEY)),)

# Flags passed to the netdbg banner across the dev recipes.
DEBUG_FLAG := $(if $(filter true,$(USE_BFTORCH_DEBUG)),1,0)
HTTPS_FLAG := $(if $(DEBUG_HTTPS),1,0)

# --- packaging identity --------------------------------------------------- #
APP_NAME    := bftorch
PRODUCT     := PyTorch Sandbox
# Single source of truth for the version is pyproject.toml — parse it at
# make-time so a bump there can't silently desync the Tauri build / bundle.
VERSION     := $(shell awk -F'"' '/^version[[:space:]]*=/ {print $$2; exit}' pyproject.toml)

BINARY      := bftorch
ENTRY       := program:main
TAURI_DIR   := tauri
TAURI_BIN   := bftorch-app

APP_BUNDLE     := bftorch.app
APP_BUNDLE_ID  := com.bftorch.app
DMG            := bftorch.dmg

DIST_DIR    := dist
WHEEL       := $(DIST_DIR)/$(APP_NAME)-$(VERSION)-py3-none-any.whl
PYAPP_ROOT  := build/pyapp
STATIC_DIR  := backend/static
FRONTEND_BUILD := frontend/dist/index.html

# PyApp downloads a standalone CPython on first launch; pin it for torch wheel
# availability + reproducibility. The dep download (torch etc.) is cached.
PYAPP_PYTHON_VERSION ?= 3.12
PYAPP_CACHE := $(HOME)/Library/Application Support/pyapp/$(APP_NAME)

.DEFAULT_GOAL := help
.PHONY: help install install-backend install-frontend start stop restart test \
        backend frontend dev build clean distclean _tls \
        icon static wheel package package-py package-tauri app run mac-only

help:
	@echo "PyTorch Sandbox"
	@echo ""
	@echo "  Dev:"
	@echo "    make install   - Python venv + backend deps, and frontend npm deps"
	@echo "    make start     - start backend (:$(PORT)) and frontend (:5173) in the background"
	@echo "    make run       - run backend + frontend from source in the foreground (no pyapp)"
	@echo "    make stop      - stop backend and frontend"
	@echo "    make restart   - stop then start"
	@echo "    make test      - run backend smoke tests + frontend build"
	@echo "    make build     - production build of the frontend"
	@echo "    (make backend / make frontend run a single service in the foreground)"
	@echo ""
	@echo "  Expose to other computers on the LAN (testing):"
	@echo "    USE_BFTORCH_DEBUG=true make start   - bind 0.0.0.0 + self-signed HTTPS,"
	@echo "                                          prints the URL to open elsewhere"
	@echo "    (add BFTORCH_HTTPS=false for plain HTTP)"
	@echo ""
	@echo "  Package (macOS / Apple Silicon):"
	@echo "    make package       - build ./$(DMG) (the full native app, ready to ship)"
	@echo "    make app           - build ./$(APP_BUNDLE) only (no dmg)"
	@echo "    make package-py    - build only ./$(BINARY)      (pyapp server binary)"
	@echo "    make package-tauri - build only ./$(TAURI_BIN)   (native window shell)"
	@echo "    make icon          - regenerate $(TAURI_DIR)/icons/icon.png"
	@echo "    (build ./$(APP_BUNDLE) with 'make app', then launch it via ./$(TAURI_BIN))"
	@echo ""
	@echo "    make clean         - remove venv, node_modules, builds, app artifacts"
	@echo "    make distclean     - also remove pyapp + Tauri build caches"

# ========================================================================== #
# Dev workflow
# ========================================================================== #

install: install-backend install-frontend
	@echo "✅ Install complete. Run 'make start' and open http://localhost:5173"

install-backend:
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt

install-frontend:
	cd frontend && npm install

# --- start / stop (background) ------------------------------------------- #
start: _tls
	@mkdir -p $(RUN_DIR)
	@echo "▶  starting backend on $(BIND_HOST):$(PORT) ..."
	@$(UVICORN) backend.app:app --host $(BIND_HOST) --port $(PORT) $(UVICORN_TLS) > $(RUN_DIR)/backend.log 2>&1 & echo $$! > $(RUN_DIR)/backend.pid
	@echo "▶  starting frontend on $(BIND_HOST):5173 ..."
	@cd frontend && npm run dev > ../$(RUN_DIR)/frontend.log 2>&1 & echo $$! > $(RUN_DIR)/frontend.pid
	@echo "✅ started — backend :$(PORT), frontend http://localhost:5173"
	@$(NETDBG) banner --context dev --fe-port 5173 --be-port $(PORT) --https $(HTTPS_FLAG) --debug $(DEBUG_FLAG)
	@echo "   logs: $(RUN_DIR)/backend.log, $(RUN_DIR)/frontend.log   |   stop: make stop"

# Ensure the self-signed cert/key exist before a dev server starts.
# No-op unless debug HTTPS is active.
_tls:
	@mkdir -p $(RUN_DIR)
ifeq ($(DEBUG_HTTPS),1)
	@$(NETDBG) cert $(TLS_CERT) $(TLS_KEY) >/dev/null
endif

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
backend: _tls
	@$(NETDBG) banner --context backend --be-port $(PORT) --https $(HTTPS_FLAG) --debug $(DEBUG_FLAG)
	$(UVICORN) backend.app:app --reload --host $(BIND_HOST) --port $(PORT) $(UVICORN_TLS)

frontend: _tls
	@$(NETDBG) banner --context frontend --fe-port 5173 --https $(HTTPS_FLAG) --debug $(DEBUG_FLAG)
	cd frontend && npm run dev

dev:
	@$(MAKE) -j2 backend frontend

# `make run` runs the dev stack from source (backend + frontend, foreground).
# It does NOT build/launch the packaged pyapp+Tauri app — use `make app` /
# `./bftorch-app` for that.
run: dev

# `build` keeps its original meaning: a production frontend build.
build: $(FRONTEND_BUILD)

# ========================================================================== #
# Packaging (macOS only) — `make package` => ./bftorch.dmg
# ========================================================================== #

mac-only:
	@[ "$$(uname)" = "Darwin" ] || { echo "✋ packaging is macOS-only for now (uname=$$(uname))"; exit 1; }

# 1) Build the Three.js frontend.
$(FRONTEND_BUILD): frontend/index.html frontend/package.json frontend/tsconfig.json frontend/vite.config.ts $(wildcard frontend/src/*)
	cd frontend && { [ -d node_modules ] || npm install; } && npm run build

# 2) Copy the built SPA into the Python package so the wheel bundles it and the
#    packaged server can serve it at "/". (Gitignored; regenerated each build.)
static: $(STATIC_DIR)/index.html
$(STATIC_DIR)/index.html: $(FRONTEND_BUILD)
	@rm -rf $(STATIC_DIR)
	@mkdir -p $(STATIC_DIR)
	@cp -R frontend/dist/. $(STATIC_DIR)/
	@echo "📦 bundled frontend -> $(STATIC_DIR)/"

# 3) Build the wheel (program.py + backend package + bundled static frontend).
#    Only needs `build`/setuptools — not torch — so we use a lightweight venv.
wheel: $(WHEEL)
$(WHEEL): pyproject.toml program.py $(wildcard backend/*.py) $(STATIC_DIR)/index.html
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PY) -m pip install --quiet --upgrade build
	$(PY) -m build --wheel --outdir $(DIST_DIR)

# 4) pyapp -> ./bftorch (self-bootstrapping Python server binary).
package-py: $(BINARY)
$(BINARY): mac-only $(WHEEL)
	PYAPP_PROJECT_NAME=$(APP_NAME) \
	PYAPP_PROJECT_VERSION=$(VERSION) \
	PYAPP_PROJECT_PATH=$(abspath $(WHEEL)) \
	PYAPP_EXEC_SPEC=$(ENTRY) \
	PYAPP_PYTHON_VERSION=$(PYAPP_PYTHON_VERSION) \
	cargo install pyapp --force --root $(PYAPP_ROOT)
	cp $(PYAPP_ROOT)/bin/pyapp $(BINARY)

# 5) Tauri native-window shell -> ./bftorch-app.
package-tauri: $(TAURI_BIN)
$(TAURI_BIN): mac-only $(TAURI_DIR)/Cargo.toml $(TAURI_DIR)/src/main.rs $(TAURI_DIR)/tauri.conf.json $(TAURI_DIR)/build.rs $(TAURI_DIR)/icons/icon.png
	cd $(TAURI_DIR) && cargo build --release
	cp $(TAURI_DIR)/target/release/$(TAURI_BIN) $(TAURI_BIN)

icon: $(TAURI_DIR)/icons/icon.png
$(TAURI_DIR)/icons/icon.png:
	python3 assets/make_icon.py $@

# 6) Assemble the .app bundle. The Tauri shell is the GUI entry point
#    (CFBundleExecutable); the pyapp server binary rides along beside it in
#    MacOS/ where the shell discovers it as a sibling.
define INFO_PLIST_BODY
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>          <string>$(APP_BUNDLE_ID)</string>
  <key>CFBundleName</key>                <string>$(PRODUCT)</string>
  <key>CFBundleDisplayName</key>         <string>$(PRODUCT)</string>
  <key>CFBundleExecutable</key>          <string>$(TAURI_BIN)</string>
  <key>CFBundleIconFile</key>            <string>AppIcon</string>
  <key>CFBundleVersion</key>             <string>$(VERSION)</string>
  <key>CFBundleShortVersionString</key>  <string>$(VERSION)</string>
  <key>CFBundlePackageType</key>         <string>APPL</string>
  <key>LSMinimumSystemVersion</key>      <string>11.0</string>
  <key>NSHighResolutionCapable</key>     <true/>
</dict>
</plist>
endef
export INFO_PLIST_BODY

app: mac-only $(BINARY) $(TAURI_BIN)
	@echo "[app] assembling $(APP_BUNDLE) ..."
	@rm -rf $(APP_BUNDLE)
	@mkdir -p $(APP_BUNDLE)/Contents/MacOS $(APP_BUNDLE)/Contents/Resources
	@cp $(TAURI_BIN) $(APP_BUNDLE)/Contents/MacOS/$(TAURI_BIN)
	@cp $(BINARY)    $(APP_BUNDLE)/Contents/MacOS/$(BINARY)
	@chmod +x $(APP_BUNDLE)/Contents/MacOS/*
	@printf '%s\n' "$$INFO_PLIST_BODY" > $(APP_BUNDLE)/Contents/Info.plist
	@plutil -lint $(APP_BUNDLE)/Contents/Info.plist >/dev/null
	@$(MAKE) --no-print-directory _icns
	@echo "✅ built ./$(APP_BUNDLE)   (open ./$(APP_BUNDLE) or double-click in Finder)"

# Render AppIcon.icns into the bundle from the 1024px source png.
_icns: $(TAURI_DIR)/icons/icon.png
	@rm -rf build/AppIcon.iconset
	@mkdir -p build/AppIcon.iconset
	@for s in 16 32 128 256 512; do \
	  d=$$((s*2)); \
	  sips -z $$s   $$s   $(TAURI_DIR)/icons/icon.png --out build/AppIcon.iconset/icon_$${s}x$${s}.png      >/dev/null; \
	  sips -z $$d   $$d   $(TAURI_DIR)/icons/icon.png --out build/AppIcon.iconset/icon_$${s}x$${s}@2x.png   >/dev/null; \
	done
	@iconutil -c icns build/AppIcon.iconset -o $(APP_BUNDLE)/Contents/Resources/AppIcon.icns
	@cp $(TAURI_DIR)/icons/icon.png $(APP_BUNDLE)/Contents/Resources/icon.png

# 7) The headline target: wrap the .app in a compressed, draggable disk image.
package: $(DMG)
$(DMG): app
	@echo "[dmg] wiping pyapp launch cache so the binary re-extracts on first run ..."
	@rm -rf "$(PYAPP_CACHE)"
	@echo "[dmg] staging $(DMG) ..."
	@rm -rf build/dmg && mkdir -p build/dmg
	@cp -R $(APP_BUNDLE) build/dmg/
	@ln -s /Applications build/dmg/Applications
	@rm -f $(DMG)
	@hdiutil create -volname "$(PRODUCT)" -srcfolder build/dmg -fs HFS+ -ov -format UDZO $(DMG) >/dev/null
	@rm -rf build/dmg
	@echo ""
	@echo "✅ built ./$(DMG)"
	@echo "   open ./$(DMG)  then drag $(APP_BUNDLE) to Applications"

# ========================================================================== #
# Clean
# ========================================================================== #

clean: stop
	rm -rf $(VENV) frontend/node_modules frontend/dist $(RUN_DIR)
	rm -rf $(DIST_DIR) build *.egg-info $(STATIC_DIR) empty-dist
	rm -f  $(BINARY) $(TAURI_BIN)
	rm -rf $(APP_BUNDLE) $(DMG)
	@rm -rf "$(PYAPP_CACHE)"
	@echo "🧹 cleaned"

distclean: clean
	rm -rf $(PYAPP_ROOT) $(TAURI_DIR)/target
	@echo "🧹 distcleaned (build caches removed)"
