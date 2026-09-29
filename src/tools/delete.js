import { handler } from '../result.js';
import { runMove } from './organize.js';
import { CONFIRM_RULE, accountArg, confirmArg, mailboxArg, messageIdArg, requireConfirmation } from './shared.js';

export async function deleteMessage({ account, mailbox, id, confirm }) {
  // Vérifié ici, avant tout appel à Mail.
  requireConfirmation(confirm, "le message n'a PAS été mis à la corbeille");
  const res = await runMove({ account, id, from_mailbox: mailbox, to_role: 'trash' });
  const out = {
    deleted: res.moved,
    account: res.from_account,
    moved_to: res.to,
    id: res.id,
    subject: res.subject,
    from: res.from,
    new_id: res.new_id,
  };
  if (res.note) out.note = res.note;
  if (res.moved) {
    out.undo = `Pour annuler : move_message avec account="${res.from_account}", from_mailbox="${res.to}", to_mailbox="${res.from}" et id=${res.new_id ?? 'le nouvel id'}.`;
  }
  return out;
}

export function registerDeleteTools(server) {
  server.registerTool(
    'delete_message',
    {
      title: 'Mettre un message à la corbeille',
      description:
        'Déplace un message vers la corbeille de son compte. Jamais de suppression définitive, jamais de vidage de corbeille. ' +
        `Refuse si confirm n'est pas true. ${CONFIRM_RULE}`,
      inputSchema: { account: accountArg, mailbox: mailboxArg, id: messageIdArg, confirm: confirmArg },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    handler(deleteMessage),
  );
}
