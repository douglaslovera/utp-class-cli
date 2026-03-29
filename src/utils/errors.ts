import type { ApiErrorResponse } from "../types/api";

type ErrorCode =
  | "BAD_REQUEST"
  | "CONFIG_ERROR"
  | "AUTH_ERROR"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_MAPPING_PENDING"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code: ErrorCode;
      statusCode: number;
      expose?: boolean;
      cause?: unknown;
      details?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.expose = options.expose ?? true;
    this.details = options.details;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, {
      code: "CONFIG_ERROR",
      statusCode: 500,
      cause: options.cause,
    });
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, {
      code: "BAD_REQUEST",
      statusCode: 400,
      cause: options.cause,
    });
  }
}

export class AuthError extends AppError {
  constructor(message: string, options: { cause?: unknown; details?: unknown } = {}) {
    super(message, {
      code: "AUTH_ERROR",
      statusCode: 503,
      cause: options.cause,
      details: options.details,
    });
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, options: { cause?: unknown; details?: unknown } = {}) {
    super(message, {
      code: "UPSTREAM_ERROR",
      statusCode: 502,
      cause: options.cause,
      details: options.details,
    });
  }
}

export class UpstreamMappingPendingError extends AppError {
  constructor(message: string) {
    super(message, {
      code: "UPSTREAM_MAPPING_PENDING",
      statusCode: 501,
    });
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      expose: false,
      cause: error,
    });
  }

  return new AppError("Unexpected internal error", {
    code: "INTERNAL_ERROR",
    statusCode: 500,
    expose: false,
    details: { value: error },
  });
}

export function toErrorResponse(error: AppError): ApiErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.expose ? error.message : "Internal server error",
    },
  };
}
