import { z } from 'zod';
import { ErrorCode, MailMcpError } from '../errors.js';

export const accountArg = z
  .string()
  .min(1)
  .describe('Compte de Mail : son nom tel que renvoyé par list_accounts (ex. "iCloud"), ou une de ses adresses.');

export const mailboxArg = z
  .string()
  .min(1)
  .describe(
    'Boîte du compte : chemin complet renvoyé par list_mailboxes (ex. "Archives/Clients"), ' +
      'ou nom générique valable pour tout compte : "INBOX", "Drafts", "Sent", "Trash", "Junk".',
  );

export const messageIdArg = z.number().int().describe('Id du message, renvoyé par list_messages ou search_messages.');

// Déclaré optionnel pour que le refus vienne du handler, avec un message exploitable.
export const confirmArg = z
  .boolean()
  .optional()
  .describe("Doit valoir true, et seulement après l'accord explicite de l'utilisateur dans la conversation.");

export const CONFIRM_RULE =
  "Ne jamais appeler ce tool sans avoir montré l'aperçu à l'utilisateur et obtenu son accord explicite dans la conversation.";

export const MESSAGE_KEY = 'Un message est identifié par le triplet (account, mailbox, id).';

export function requireConfirmation(confirm, notDone) {
  if (confirm !== true) {
    throw new MailMcpError(
      ErrorCode.CONFIRMATION_REQUIRED,
      `Confirmation requise : ${notDone}. Montrez d'abord à l'utilisateur ce qui va être fait, ` +
        'obtenez son accord explicite, puis rappelez ce tool avec confirm=true.',
    );
  }
}
