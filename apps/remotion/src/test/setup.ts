import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so RTL's automatic cleanup never registers.
afterEach(cleanup);

// Browser APIs Radix UI relies on that jsdom does not implement
// (same shims as packages/ui/src/test/setup.ts).
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.hasPointerCapture = () => false;
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
