import { z } from 'zod';
import { config } from '../config.js';
import { runJxa } from '../osascript.js';
import { handler } from '../result.js';
import { mailboxArg, messageIdArg } from './shared.js';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export async function moveMessage({ id, from_mailbox, to_mailbox }) {
  const res = await runJxa('move_message', { id, from_mailbox, to_mailbox, budget_ms: config.moveBudgetMs });
  const out = { moved: res.moved, id: res.id, subject: res.subject, from: res.from, to: res.to, new_id: res.new_id };
  if (res.moved && res.new_id === null) {
    out.note = "Déplacement effectué, mais le nouvel id n'est pas encore visible (synchronisation en cours). Relancez list_messages sur la boîte cible.";
  }
  if (!res.moved) {
    out.note = 'Mail a accepté la commande mais le message est toujours dans la boîte d\'origine. Vérifiez dans Mail.';
  }
  return out;
}

export function registerOrganizeTools(server) {
  server.registerTool(
    'move_message',
    {
      title: 'Déplacer un message',
      description:
        'Déplace un message vers une autre boîte du compte iCloud. La boîte cible doit exister : elle n\'est jamais créée, ' +
        'et l\'erreur liste alors les boîtes existantes. L\'id du message change après déplacement : utiliser "new_id" avec la nouvelle boîte.',
      inputSchema: {
        id: messageIdArg,
        from_mailbox: mailboxArg.describe('Chemin de la boîte où se trouve le message.'),
        to_mailbox: mailboxArg.describe('Chemin de la boîte de destination (doit exister).'),
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    handler(moveMessage),
  );

  server.registerTool(
    'flag_message',
    {
      title: 'Poser ou retirer le drapeau',
      description: 'Pose (flagged=true) ou retire (flagged=false) le drapeau d\'un message.',
      inputSchema: {
        id: messageIdArg,
        mailbox: mailboxArg,
        flagged: z.boolean().default(true).describe('true pour poser le drapeau, false pour le retirer.'),
      },
      annotations: WRITE,
    },
    handler(async ({ id, mailbox, flagged }) => {
      const res = await runJxa('set_status', { id, mailbox, flagged });
      return { id: res.id, mailbox: res.mailbox, subject: res.subject, flagged: res.flagged };
    }),
  );

  server.registerTool(
    'mark_read',
    {
      title: 'Marquer lu ou non lu',
      description: 'Marque un message comme lu (read=true) ou non lu (read=false).',
      inputSchema: {
        id: messageIdArg,
        mailbox: mailboxArg,
        read: z.boolean().default(true).describe('true pour marquer lu, false pour marquer non lu.'),
      },
      annotations: WRITE,
    },
    handler(async ({ id, mailbox, read }) => {
      const res = await runJxa('set_status', { id, mailbox, read });
      return { id: res.id, mailbox: res.mailbox, subject: res.subject, read: res.read };
    }),
  );
}
