# VeriDAO — build orchestration.
# The root package.json has NO scripts by design: this Makefile orchestrates
# builds, and lint/test fan out via pnpm's recursive filter. Don't add root
# scripts; they'd duplicate the Makefile.

SOLANA_VERSION ?= 1.18.20
ANCHOR_VERSION ?= 0.31.0

.PHONY: prep build test test_surfpool run_surfpool lint clean help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

prep: ## Install Solana + Anchor toolchains, then workspace deps
	solana-install init $(SOLANA_VERSION)
	cargo install avm --locked || true
	avm install $(ANCHOR_VERSION) && avm use $(ANCHOR_VERSION)
	pnpm install

build: ## Build programs + packages + docs
	anchor build
	pnpm -r run build

test: ## Run Rust unit tests + jest integration suite against a local validator
	anchor test

test_surfpool: ## Run the full suite against a running Surfpool instance
	pnpm --filter @veridao/tests test

run_surfpool: ## Start a Surfpool local fork (run in a separate terminal)
	surfpool

lint: ## Lint every workspace that declares a lint script
	pnpm -r run lint

clean: ## Remove build artifacts and node_modules
	anchor clean
	rm -rf node_modules
