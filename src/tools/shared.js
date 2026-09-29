import { z } from 'zod';
import { ErrorCode, MailMcpError } from '../errors.js';

export const mailboxArg = z
  .string()
  .min(1)
  .describe('Chemin complet de la boîte dans le compte iCloud, tel que renvoyé par list_mailboxes (ex. "INBOX", "Archives/Clients").');

export const messageIdArg = z.number().int().describe('Id du message, renvoyé par list_messages ou search_messages.');

// Déclaré optionnel pour que le refus vienne du handler, avec un message exploitable.
export const confirmArg = z
  .boolean()
  .optional()
  .describe("Doit valoir true, et seulement après l'accord explicite de l'utilisateur dans la conversation.");

export const CONFIRM_RULE =
  "Ne jamais appeler ce tool sans avoir montré l'aperçu à l'utilisateur et obtenu son accord explicite dans la conversation.";

export function requireConfirmation(confirm, notDone) {
  if (confirm !== true) {
    throw new MailMcpError(
      ErrorCode.CONFIRMATION_REQUIRED,
      `Confirmation requise : ${notDone}. Montrez d'abord à l'utilisateur ce qui va être fait, ` +
        'obtenez son accord explicite, puis rappelez ce tool avec confirm=true.',
    );
  }
}
