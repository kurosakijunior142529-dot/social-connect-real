// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// h3 catches some request-stream failures before they can reach the server
// wrapper. It still reports the original Error through console.error, so retain
// that raw value for the response normalizer below. Keep the original console
// method untouched so deployment logs continue to receive the full stack.
const captureGuard = Symbol.for("vibely.error-capture.console-installed");
const captureState = globalThis as typeof globalThis & { [captureGuard]?: boolean };
if (!captureState[captureGuard]) {
  captureState[captureGuard] = true;
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const rawError = args.find((arg) => arg instanceof Error);
    if (rawError !== undefined) record(rawError);
    originalConsoleError(...args);
  };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
