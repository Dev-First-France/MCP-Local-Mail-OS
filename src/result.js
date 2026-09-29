import { ErrorCode, MailMcpError } from './errors.js';

export function ok(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

export function fail(error) {
  const body =
    error instanceof MailMcpError
      ? error.toJSON()
      : { code: ErrorCode.OSASCRIPT_ERROR, message: error?.message || String(error) };
  if (!(error instanceof MailMcpError)) console.error('[mail-mcp] erreur inattendue', error);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: body }, null, 2) }],
    structuredContent: { error: body },
  };
}

// Enveloppe un handler : toute exception devient une réponse d'erreur exploitable.
export function handler(fn) {
  return async (args, extra) => {
    try {
      return ok(await fn(args ?? {}, extra));
    } catch (error) {
      return fail(error);
    }
  };
}
