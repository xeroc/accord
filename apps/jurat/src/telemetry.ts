/**
 * Pydantic Logfire telemetry — LLM observability for the verdict agent.
 *
 * configureLogfire() is called from main() only when JURAT_LOGFIRE is on; it
 * installs the global OTel providers exporting to Logfire. Pair it with
 * `registerTelemetry(new OpenTelemetry())` (from @ai-sdk/otel, see main.ts)
 * so every AI SDK 7 call becomes a span on that provider. Token resolution
 * stays with the SDK: LOGFIRE_TOKEN env or `.logfire/logfire_credentials.json`
 * (written by the Logfire agent-setup wizard; never committed).
 */
import * as logfire from "@pydantic/logfire-node";

/** Install the global OTel provider exporting to Logfire. Call once at boot. */
export function configureLogfire(serviceName: string): void {
  logfire.configure({
    serviceName,
    // The daemon is a chain-polling loop: auto http/fs spans would bury the
    // LLM signal under RPC chatter. Winston log records still flow.
    nodeAutoInstrumentations: {
      "@opentelemetry/instrumentation-http": { enabled: false },
      "@opentelemetry/instrumentation-fs": { enabled: false },
    },
  });
}
