# Root Makefile — single entry point for all monorepo tasks.
# Run `make` (no args) or `make help` to list all targets.
#
# Convention: each documented target carries `## description` so help
# can auto-generate the table. Categories use `##@`.
#
# Project rule: every recurring manual step belongs here. If a README says
# "now run X", that's a bug — add a target instead.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# Canonical versions
NODE_MIN_VERSION := 20.11.0
PNPM_VERSION    := 10.0.0
DESKTOP_DIR     := apps/desktop

APP_NAME := looper

.PHONY: help install \
        status diff diff-stat diff-check gitignore-audit review \
        dev dev-web dev-mobile dev-all build build-download build-debug build-debug-signed build-release build-all test-desktop test-mobile \
        typecheck lint lint-desktop lint-fix format format-check check check-fix tokens tokens-check test ci \
        update-deps licenses-audit \
        clean nuke

##@ General

help: ## List available targets
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make \033[36m<target>\033[0m\n\n"} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)
	@echo ""


##@ Review

status: ## Show concise working tree status
	@git status --short

diff: ## Show staged and unstaged diffs
	@git diff
	@git diff --cached

diff-stat: ## Show staged and unstaged diff stats
	@git diff --stat
	@git diff --cached --stat

diff-check: ## Fail on whitespace errors in staged or unstaged diffs
	@git diff --check
	@git diff --cached --check

gitignore-audit: ## Fail if tracked files now match ignore rules
	@tracked_ignored="$$(git ls-files -ci --exclude-standard | while IFS= read -r file; do \
		if [ -e "$$file" ]; then printf '%s\n' "$$file"; fi; \
	done)"; \
	if [ -n "$$tracked_ignored" ]; then \
		echo "Tracked files matching ignore rules:"; \
		echo "$$tracked_ignored"; \
		exit 1; \
	fi; \
	echo "✓ no tracked ignored files."

review: status diff-stat diff-check gitignore-audit ## Review current git changes and common diff problems

##@ Setup


install: ## Just install dependencies (no wizard)
	@pnpm install --frozen-lockfile
	@echo "✓ install done. Run 'make dev' to start."


##@ Development

dev: ## Start the Looper desktop app in development mode
	@cd $(DESKTOP_DIR) && pnpm tauri dev

dev-web: ## Start only the desktop Vite frontend
	@cd $(DESKTOP_DIR) && pnpm dev

dev-mobile: ## Start the React Native development build server
	@pnpm --filter @looper/mobile start

dev-all: ## Start all monorepo dev servers
	@pnpm turbo run dev

##@ Build

build: ## Build an unsigned local Looper.app bundle
	@cd $(DESKTOP_DIR) && pnpm tauri build --bundles app --no-sign

build-download: ## Build unsigned local Looper.app and DMG bundles for sharing
	@cd $(DESKTOP_DIR) && pnpm tauri build --bundles app,dmg --no-sign

build-debug: ## Build an unsigned debug Looper.app bundle
	@cd $(DESKTOP_DIR) && pnpm tauri build --debug --bundles app --no-sign

build-debug-signed: ## Build signed Looper QA.app so macOS permissions survive rebuilds
	@cd $(DESKTOP_DIR) && pnpm tauri build --debug --bundles app --config src-tauri/tauri.qa.conf.json

build-release: ## Build signed release bundles (requires signing secrets)
	@cd $(DESKTOP_DIR) && pnpm tauri build

build-all: ## Build every package in the monorepo
	@pnpm turbo run build

##@ Quality

typecheck: ## Run TypeScript type checking everywhere
	@pnpm turbo run typecheck

lint: ## Run Biome linter
	@pnpm exec biome lint .

lint-desktop: ## Enforce the desktop Tauri data boundary
	@pnpm --dir $(DESKTOP_DIR) lint:ci

lint-fix: ## Run Biome linter with auto-fix
	@pnpm exec biome lint --write .

format: ## Format all files with Biome
	@pnpm exec biome format --write .

format-check: ## Check formatting without writing
	@pnpm exec biome format .

check: ## Check lint, format, and imports without writing
	@pnpm exec biome check .

check-fix: ## Fix Biome lint, format, and import issues
	@pnpm exec biome check --write .

tokens: ## Generate shared desktop, web, and mobile color tokens
	@node tools/tokens/generate.mjs

tokens-check: ## Check that generated color tokens match the shared palette
	@node tools/tokens/generate.mjs --check

test: ## Run all tests
	@pnpm turbo run test

test-desktop: ## Run desktop frontend and Rust tests
	@cd $(DESKTOP_DIR) && pnpm test
	@cargo test --manifest-path $(DESKTOP_DIR)/src-tauri/Cargo.toml --lib
	@cargo test --manifest-path packages/rust/audio/Cargo.toml --workspace
	@cargo test --manifest-path packages/rust/looper-ts/Cargo.toml --lib

test-mobile: ## Typecheck and test the React Native app
	@pnpm --filter @looper/mobile typecheck
	@pnpm --filter @looper/mobile test
ci: ## Run portable static and unit checks locally
	@pnpm run verify





##@ Dependencies

update-deps: ## Update dependencies interactively
	@pnpm update --interactive --recursive

licenses-audit: ## Audit dependency licenses
	@pnpm licenses list
	@cargo metadata --format-version 1 --locked --manifest-path $(DESKTOP_DIR)/src-tauri/Cargo.toml >/dev/null

##@ Cleanup

clean: ## Remove build artifacts (keeps node_modules)
	@pnpm turbo run clean

nuke: ## DELETE node_modules + build artifacts (irreversible without reinstall)
	@echo "About to remove: node_modules/ .turbo/ dist/ across workspace"
	@read -p "Are you sure? [y/N] " ans && [ "$$ans" = "y" ]
	@mv node_modules /tmp/$(APP_NAME)-nm-$$(date +%s) 2>/dev/null || true
	@find . -type d -name ".turbo" -not -path '*/node_modules/*' -exec mv {} /tmp/$(APP_NAME)-turbo-$$(date +%s)-{} \; 2>/dev/null || true
	@find . -type d -name "dist" -not -path '*/node_modules/*' -exec mv {} /tmp/$(APP_NAME)-dist-$$(date +%s)-{} \; 2>/dev/null || true
	@echo "✓ nuked. Run 'make install' to restore dependencies."
