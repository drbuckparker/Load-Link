import type { ErrorRequestHandler, Request } from "express";

/**
 * Plug in a reporting service later by calling setErrorReporter.
 * Nothing is sent anywhere until that happens.
 */
export type ServerErrorReporter = (err: unknown, req: Request) => void;

let errorReporter: ServerErrorReporter | null = null;

export function setErrorReporter(reporter: ServerErrorReporter | null): void {
  errorReporter = reporter;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const error = err as {
    status?: number;
    statusCode?: number;
    message?: string;
  };

  const status = error.status || error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  console.error("Internal Server Error:", err);

  if (errorReporter) {
    try {
      errorReporter(err, req);
    } catch (reportErr) {
      console.error("Error reporter failed:", reportErr);
    }
  }

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json({ message });
};
