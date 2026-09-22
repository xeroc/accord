# Accord — build orchestration.
# The root package.json has NO scripts by design: this Makefile orchestrates
# builds, and lint/test fan out via pnpm's recursive filter. Don't add root
# scripts; they'd duplicate the Makefile.

SOLANA_VERSION ?= 3.1.10
ANCHOR_VERSION ?= 1.2.0
ACCORD_PROGRAM_ID ?= cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed

# sBPFv3 bytecode (SIMD-0178/0189/0377; static syscalls). SIMD-0500 will reject
# deployments/upgrades of older bytecode, so pin arch + platform-tools explicitly
# instead of relying on anchor's defaults. NEVER pass --arch v3 to platform-tools
# older than v1.53 — it silently emits non-v3 bytecode.
SBPF_ARCH ?= v3
SBPF_TOOLS ?= v1.57
ANCHOR_BUILD_FLAGS := --ignore-keys --arch $(SBPF_ARCH) --tools-version $(SBPF_TOOLS)

TODAY := $(shell date +%Y-%m-%d)
DEPLOY_KEY_PATH := $(or $(ACCORD_DEPLOY_KEY_PATH),~/.config/solana/id.json)
SOLANA_API := $(or $(SOLANA_API),https://api.mainnet-beta.solana.com)
SOLANA_WS := $(subst https://,wss://,$(SOLANA_API))

.PHONY: prep build codegen sdk docs test test_unit lint verify-sbf clean help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

verify-sbf: ## Assert every program ELF is canonical sBPFv3 (e_flags 0x3, e_machine BPF/247)
	@for so in target/deploy/accord.so target/deploy/canon.so target/deploy/synod.so; do \
		readelf -h $$so | grep -Eq 'Flags:.*0x3(,| |$$)' || { echo "FAIL: $$so is not sBPFv3 (e_flags)"; exit 1; }; \
		readelf -h $$so | grep -Eq 'Machine:.*BPF' || { echo "FAIL: $$so e_machine is not BPF (247) — wrong target? (accord-cvxo: agave 3.1.x sbpf rejects non-247 v3 ELFs)"; exit 1; }; \
		find programs/*/src -name '*.rs' -newer $$so -print -quit | grep -q . && { echo "FAIL: $$so is stale (program sources newer) — run 'make build' first"; exit 1; }; \
		echo "OK: $$so -> $$(readelf -h $$so | grep Flags:)"; \
	done

prep: ## Install Solana + Anchor toolchains, then workspace deps
	agave-install init $(SOLANA_VERSION)
	cargo install avm --locked || true
	avm install $(ANCHOR_VERSION) && avm use $(ANCHOR_VERSION)
	pnpm install
	cd apps/docs && poetry install --no-root

build: ## Build programs (sBPFv3) + packages + docs
	anchor build $(ANCHOR_BUILD_FLAGS)
	$(MAKE) verify-sbf
	pnpm -r run build
	$(MAKE) -C apps/docs build
	$(MAKE) codegen

codegen: ## Regenerate the Codama Kit clients from the program IDLs (run after `anchor build`)
	cd packages/sdk && pnpm exec codama run js
	cd packages/synod && pnpm exec codama run js

sdk: ## Build the SDK package only
	cd packages/sdk && pnpm run build

docs: ## Build the MkDocs site into apps/docs/site/
	$(MAKE) -C apps/docs build

docs-serve: ## Live-reload MkDocs dev server
	$(MAKE) -C apps/docs serve

test: ## Full suite: Rust unit + LiteSVM + jest e2e (anchor test auto-starts Surfpool)
	anchor build $(ANCHOR_BUILD_FLAGS)
	$(MAKE) verify-sbf
	anchor test --skip-build

test_unit: verify-sbf ## LiteSVM + unit tests (requires fresh canonical v3 ELFs —
	## the 2c51f89 "green" ran against a stale pre-v3 .so; verify-sbf now
	## fails fast on stale or non-canonical artifacts). The no-entrypoint
	## feature is REQUIRED per program — plain `cargo test` (or a single
	## package's flag) compiles but silently SKIPS every other package's
	## *_litesvm.rs (they are `#![cfg(feature = "no-entrypoint")]`-gated).
	## AGENTS.md §Testing.
	cargo test --features accord/no-entrypoint,canon/no-entrypoint,synod/no-entrypoint

lint: ## Lint every workspace that declares a lint script
	pnpm -r run lint

clean: ## Remove build artifacts and node_modules
	anchor clean
	rm -rf node_modules

devnet_deploy:
	anchor program deploy --provider.cluster $(SOLANA_API)
	# solana program write-buffer --keypair $(DEPLOY_KEY_PATH) --ws $(SOLANA_WS) ./target/deploy/accord.so
