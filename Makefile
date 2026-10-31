ifeq ($(OS),Windows_NT)
  PYTHON ?= python
  VENV_PY := .venv/Scripts/python.exe
else
  PYTHON ?= python3
  VENV_PY := .venv/bin/python
endif

.DEFAULT_GOAL := help

.PHONY: help setup dev dev-api dev-web test typecheck lint check migrate build seed

help:
	@echo "TeamSync commands:"
	@echo "  make setup    install Python / Node dependencies"
	@echo "  make dev      start backend(8000) and frontend(5173)"
	@echo "  make check    pytest + typecheck + lint"
	@echo "  make test     backend pytest only"
	@echo "  make migrate  alembic upgrade head"
	@echo "  make build    build Web assets"
	@echo "  make seed     seed data (planned in W1-09)"

setup:
	@$(PYTHON) -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' || (echo "Python 3.12+ is required" && exit 1)
	@if [ -d server/.venv ] && [ ! -f server/$(VENV_PY) ]; then echo "server/.venv belongs to another platform. Delete server/.venv and rerun make setup."; exit 1; fi
	@$(PYTHON) scripts/init_env.py
	cd server && $(PYTHON) -m venv .venv && $(VENV_PY) -m pip install -e ".[dev]"
	pnpm install

dev:
	make -j2 dev-api dev-web

dev-api:
	cd server && $(VENV_PY) -m uvicorn app.main:app --reload --port 8000

dev-web:
	pnpm --filter @teamsync/web dev

test:
	cd server && $(VENV_PY) -m pytest

typecheck:
	pnpm -r typecheck

lint:
	cd server && $(VENV_PY) -m ruff check .
	pnpm -r lint

check: test typecheck lint

migrate:
	cd server && $(VENV_PY) -m alembic upgrade head

build:
	pnpm --filter @teamsync/web build

seed:
	@echo "make seed is not available yet (planned in W1-09)" >&2
	@exit 1
