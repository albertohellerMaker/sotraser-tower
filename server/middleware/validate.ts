import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z, ZodError, ZodSchema } from "zod";

interface ValidateSchemas {
  params?: ZodSchema;
  query?: ZodSchema;
  body?: ZodSchema;
}

export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: { field: string; message: string }[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.push(...formatErrors("params", result.error));
      } else {
        req.params = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.push(...formatErrors("query", result.error));
      } else {
        (req as any).validatedQuery = result.data;
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.push(...formatErrors("body", result.error));
      } else {
        req.body = result.data;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: "Validación fallida",
        details: errors,
      });
    }

    next();
  };
}

function formatErrors(source: string, error: ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: `${source}.${issue.path.join(".")}`,
    message: issue.message,
  }));
}

export type ValidatedRequest<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown,
> = Request<TParams, any, TBody> & { validatedQuery: TQuery };

export function typedHandler<TParams = any, TQuery = any, TBody = any>(
  schemas: ValidateSchemas,
  handler: (req: ValidatedRequest<TParams, TQuery, TBody>, res: Response) => Promise<void> | void
): RequestHandler[] {
  return [
    validate(schemas),
    async (req: Request, res: Response, _next: NextFunction) => {
      try {
        await handler(req as ValidatedRequest<TParams, TQuery, TBody>, res);
      } catch (e: any) {
        console.error(`[API] Error:`, e.message);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error interno del servidor" });
        }
      }
    },
  ];
}
