# Accord — build orchestration.
# The root package.json has NO scripts by design: this Makefile orchestrates
# builds, and lint/test fan out via pnpm's recursive filter. Don't add root
# scripts; they'd duplicate the Makefile.

SOLANA_VERSION ?= 3.1.10
ANCHOR_VERSION ?= 1.0.2
ACCORD_PROGRAM_ID ?= RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe

# `--ignore-keys`: the canonical deploy keypair is provisioned separately
# (ops concern). Local builds/tests load the .so at the declared address
# via `run_validator` / `--bpf-program` — no keypair needed. See ADR-0010.

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

codegen: ## Regenerate the Codama Kit client from the Accord IDL (run after `anchor build`)
	anchor build --ignore-keys
	cd packages/sdk && pnpm exec codama run js

sdk: ## Build the SDK package only
	cd packages/sdk && pnpm run build

docs: ## Build the MkDocs site into apps/docs/site/
	$(MAKE) -C apps/docs build

docs-serve: ## Live-reload MkDocs dev server
	$(MAKE) -C apps/docs serve

test: ## Build + run jest suite (offline smoke). For on-chain tests: `make run_validator` first, then `make test`
	anchor build --ignore-keys
	anchor test --skip-build

test_unit: ## Run LiteSVM Rust unit/TDD tests (fast, no validator). Needs the .so first.
	cargo build-sbf --tools-version v1.52 --manifest-path programs/accord/Cargo.toml
	cargo test --manifest-path programs/accord/Cargo.toml --features no-entrypoint
	# `--features no-entrypoint`: the program's `entrypoint!` symbol collides with
	# a builtin when the program crate is linked into the test binary; the .so
	# (built above WITH the entrypoint) is what LiteSVM loads. See AGENTS.md.
	# `--tools-version v1.52`: needed while Solana CLI < 3.x is installed (it
	# bundles platform-tools v1.48 / cargo 1.84, which can't parse edition2024
	# manifests). `make prep` installs Solana 3.1.10, which drops this flag.
	# `anchor build` is unaffected — it manages its own toolchain.

test_surfpool: ## Run the full suite against a running Surfpool instance
	pnpm --filter @useaccord/tests test

run_surfpool: ## Start a fresh Surfpool Surfnet (auto-deploys accord.so via runbook; separate terminal)
	surfpool start --yes --db :memory:

run_validator: ## Start a local test-validator with the Accord .so at its declared address (no keypair needed)
	solana-test-validator --reset \
	  --bpf-program $(ACCORD_PROGRAM_ID) target/deploy/accord.so

lint: ## Lint every workspace that declares a lint script
	pnpm -r run lint

clean: ## Remove build artifacts and node_modules
	anchor clean
	rm -rf node_modules
