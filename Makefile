# Accord — build orchestration.
# The root package.json has NO scripts by design: this Makefile orchestrates
# builds, and lint/test fan out via pnpm's recursive filter. Don't add root
# scripts; they'd duplicate the Makefile.

SOLANA_VERSION ?= 3.1.10
ANCHOR_VERSION ?= 1.0.2
ACCORD_PROGRAM_ID ?= cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed

TODAY := $(shell date +%Y-%m-%d)
DEPLOY_KEY_PATH := $(or $(ACCORD_DEPLOY_KEY_PATH),~/.config/solana/id.json)
SOLANA_API := $(or $(SOLANA_API),https://api.mainnet-beta.solana.com)
SOLANA_WS := $(subst https://,wss://,$(SOLANA_API))

.PHONY: prep build codegen sdk docs test test_unit test_surfpool run_surfpool run_validator lint clean help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

prep: ## Install Solana + Anchor toolchains, then workspace deps
	solana-install init $(SOLANA_VERSION)
	cargo install avm --locked || true
	avm install $(ANCHOR_VERSION) && avm use $(ANCHOR_VERSION)
	pnpm install
	cd apps/docs && poetry install --no-root

build: ## Build programs + packages + docs
	anchor build --ignore-keys
	pnpm -r run build
	$(MAKE) -C apps/docs build

codegen: ## Regenerate the Codama Kit clients from the program IDLs (run after `anchor build`)
	anchor build --ignore-keys
	cd packages/sdk && pnpm exec codama run js
	cd packages/synod && pnpm exec codama run js

sdk: ## Build the SDK package only
	cd packages/sdk && pnpm run build

docs: ## Build the MkDocs site into apps/docs/site/
	$(MAKE) -C apps/docs build

docs-serve: ## Live-reload MkDocs dev server
	$(MAKE) -C apps/docs serve

test: ## Full suite: Rust unit + LiteSVM + jest e2e (anchor test auto-starts Surfpool)
	anchor build --ignore-keys
	anchor test --skip-build

test_unit:
	cargo test

lint: ## Lint every workspace that declares a lint script
	pnpm -r run lint

clean: ## Remove build artifacts and node_modules
	anchor clean
	rm -rf node_modules

devnet_deploy:
	anchor program deploy --provider.cluster $(SOLANA_API)
	# solana program write-buffer --keypair $(DEPLOY_KEY_PATH) --ws $(SOLANA_WS) ./target/deploy/accord.so
