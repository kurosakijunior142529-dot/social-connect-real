import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    let current: unknown = error;
    for (let i = 0; i < 5 && current; i++) {
      const candidate = current as { code?: string; name?: string; message?: string; cause?: unknown };
      if (
        candidate.code === "ECONNRESET" ||
        candidate.name === "AbortError" ||
        candidate.message === "aborted"
      ) {
        return new Response(null, { status: 499 });
      }
      current = candidate.cause;
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  defaultSsr: false,
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
