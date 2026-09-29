import { z } from 'zod';
import { config } from '../config.js';
import { runJxa } from '../osascript.js';
import { handler } from '../result.js';
import { accountArg, mailboxArg, messageIdArg } from './shared.js';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// Sert au déplacement comme à la mise à la corbeille (to_role = "trash").
export async function runMove(input) {
  const res = await runJxa('move_message', { ...input, budget_ms: config.moveBudgetMs });
  const out = {
    moved: res.moved,
    id: res.id,
    subject: res.subject,
    from_account: res.from_account,
    from: res.from,
    to_account: res.to_account,
    to: res.to,
    new_id: res.new_id,
  };
  if (res.moved && res.new_id === null) {
    out.note = "Déplacement effectué, mais le nouvel id n'est pas encore visible (synchronisation en cours). Relancez list_messages sur la boîte cible.";
  }
  if (!res.moved) {
    out.note = "Mail a accepté la commande mais le message est toujours dans la boîte d'origine. Vérifiez dans Mail.";
  }
  return out;
}

export function registerOrganizeTools(server) {
  server.registerTool(
    'move_message',
    {
      title: 'Déplacer un message',
      description:
        "Déplace un message vers une autre boîte, du même compte ou d'un autre compte (to_account). La boîte cible doit exister : " +
        "elle n'est jamais créée, et l'erreur liste alors les boîtes existantes. L'id du message change après déplacement : " +
        'utiliser "new_id" avec le compte et la boîte de destination.',
      inputSchema: {
        account: accountArg.describe('Compte où se trouve le message (nom ou adresse).'),
        id: messageIdArg,
        from_mailbox: mailboxArg.describe('Boîte où se trouve le message.'),
        to_mailbox: mailboxArg.describe('Boîte de destination (doit exister).'),
        to_account: accountArg.optional().describe('Compte de destination. Omis : le même compte.'),
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    handler(({ account, id, from_mailbox, to_mailbox, to_account }) => runMove({ account, id, from_mailbox, to_mailbox, to_account })),
  );

  server.registerTool(
    'flag_message',
    {
      title: 'Poser ou retirer le drapeau',
      description: "Pose (flagged=true) ou retire (flagged=false) le drapeau d'un message.",
      inputSchema: {
        account: accountArg,
        mailbox: mailboxArg,
        id: messageIdArg,
        flagged: z.boolean().default(true).describe('true pour poser le drapeau, false pour le retirer.'),
      },
      annotations: WRITE,
    },
    handler(async ({ account, mailbox, id, flagged }) => {
      const res = await runJxa('set_status', { account, mailbox, id, flagged });
      return { id: res.id, account: res.account, mailbox: res.mailbox, subject: res.subject, flagged: res.flagged };
    }),
  );

  server.registerTool(
    'mark_read',
    {
      title: 'Marquer lu ou non lu',
      description: 'Marque un message comme lu (read=true) ou non lu (read=false).',
      inputSchema: {
        account: accountArg,
        mailbox: mailboxArg,
        id: messageIdArg,
        read: z.boolean().default(true).describe('true pour marquer lu, false pour marquer non lu.'),
      },
      annotations: WRITE,
    },
    handler(async ({ account, mailbox, id, read }) => {
      const res = await runJxa('set_status', { account, mailbox, id, read });
      return { id: res.id, account: res.account, mailbox: res.mailbox, subject: res.subject, read: res.read };
    }),
  );
}
