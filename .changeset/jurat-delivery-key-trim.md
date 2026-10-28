---
"@useaccord/jurat": patch
"@useaccord/ui": patch
---

jurat: file-backed delivery-key storage no longer eats a key byte when the 64-byte keypair's last byte is `\r` followed by editor `\n` contamination (read as a `\r\n` pair, trimmed to 63 bytes, then rejected) — the trim now stops at 64 bytes. ui: storybook vitest project `testTimeout` raised to 60s; the default 15s starved long stories under full-suite browser parallelism.
