export const ErrorCode = Object.freeze({
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  MAILBOX_NOT_FOUND: 'MAILBOX_NOT_FOUND',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  ATTACHMENT_NOT_FOUND: 'ATTACHMENT_NOT_FOUND',
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  DRAFT_CHANGED: 'DRAFT_CHANGED',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  AUTOMATION_DENIED: 'AUTOMATION_DENIED',
  MAIL_NOT_RUNNING: 'MAIL_NOT_RUNNING',
  TIMEOUT: 'TIMEOUT',
  OSASCRIPT_ERROR: 'OSASCRIPT_ERROR',
});

export class MailMcpError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'MailMcpError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  toJSON() {
    const out = { code: this.code, message: this.message };
    if (this.details !== undefined) out.details = this.details;
    return out;
  }
}

export const AUTOMATION_HELP =
  "Autorisation Automation refusée : ouvrez Réglages Système > Confidentialité et sécurité > Automatisation, " +
  "puis activez « Mail » pour l'application qui lance ce serveur (Terminal, iTerm, Claude, Claude Code…).";

// Numéros d'erreur Apple Event → codes du serveur.
export function codeFromAppleError(errorNumber, message = '') {
  if (errorNumber === -1743 || /-1743|not authorized to send Apple events|pas autoris/i.test(message)) {
    return ErrorCode.AUTOMATION_DENIED;
  }
  if (errorNumber === -1712) return ErrorCode.TIMEOUT;
  if (errorNumber === -600 || errorNumber === -609) return ErrorCode.MAIL_NOT_RUNNING;
  return ErrorCode.OSASCRIPT_ERROR;
}
