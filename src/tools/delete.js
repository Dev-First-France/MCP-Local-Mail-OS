import { config } from '../config.js';
import { ErrorCode, MailMcpError } from '../errors.js';
import { isInside } from '../mailboxes.js';
import { handler } from '../result.js';
import { moveMessage } from './organize.js';
import { CONFIRM_RULE, confirmArg, mailboxArg, messageIdArg, requireConfirmation } from './shared.js';

export async function deleteMessage({ id, mailbox, confirm }) {
  requireConfirmation(confirm, "le message n'a PAS été mis à la corbeille");
  if (isInside(mailbox.trim(), config.trashMailbox)) {
    throw new MailMcpError(
      ErrorCode.INVALID_ARGUMENT,
      'Ce message est déjà dans la corbeille. Ce serveur ne supprime jamais définitivement un message et ne vide jamais la corbeille.',
    );
  }
  const res = await moveMessage({ id, from_mailbox: mailbox, to_mailbox: config.trashMailbox });
  const out = { deleted: res.moved, moved_to: res.to, id: res.id, subject: res.subject, from: res.from, new_id: res.new_id };
  if (res.note) out.note = res.note;
  if (res.moved) out.undo = `Pour annuler : move_message avec from_mailbox="${res.to}" et to_mailbox="${res.from}".`;
  return out;
}

export function registerDeleteTools(server) {
  server.registerTool(
    'delete_message',
    {
      title: 'Mettre un message à la corbeille',
      description:
        'Déplace un message vers la corbeille du compte iCloud. Jamais de suppression définitive, jamais de vidage de corbeille. ' +
        `Refuse si confirm n'est pas true. ${CONFIRM_RULE}`,
      inputSchema: { id: messageIdArg, mailbox: mailboxArg, confirm: confirmArg },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    handler(deleteMessage),
  );
}
