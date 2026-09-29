import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { ErrorCode, MailMcpError } from '../errors.js';
import { isInside } from '../mailboxes.js';
import { runJxa } from '../osascript.js';
import { checkAttachmentFiles, uniqueDestination } from '../paths.js';
import { forwardBody, prefixSubject } from '../quote.js';
import { handler } from '../result.js';
import { draftResult, parseRecipient } from './compose.js';
import { mailboxArg, messageIdArg } from './shared.js';

// Nom de fichier sûr pour la copie temporaire d'une pièce jointe venue d'un mail.
const safeName = (name, index) => {
  const cleaned = String(name || '')
    .replace(/[/\\\0]/g, '_')
    .replace(/\.\.+/g, '.')
    .trim();
  return cleaned && cleaned !== '.' ? cleaned.slice(0, 200) : `piece-jointe-${index + 1}`;
};

// Transfert par repli : nouveau message « Fwd: », message d'origine cité, pièces jointes réattachées.
// La commande native « forward » de Mail n'est pas utilisée : y écrire un texte efface le message
// d'origine et ses pièces jointes (constaté sur macOS 27, voir CLAUDE.md).
async function forwardEmail({ id, mailbox, to, cc, body, attachments }) {
  const recipients = { to: to.map(parseRecipient), cc: (cc || []).map(parseRecipient), bcc: [] };
  if (recipients.to.length === 0) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, 'Au moins un destinataire "to" est requis.');
  }
  const extra = await checkAttachmentFiles(attachments);
  const original = await runJxa('read_message', { id, mailbox, body_max: config.forwardBodyMaxChars });
  if (isInside(original.mailbox, config.draftsMailbox)) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, `Impossible de transférer un message de la boîte ${config.draftsMailbox}.`);
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'mail-mcp-transfert-'));
  try {
    const forwarded = [];
    for (let i = 0; i < original.attachments.length; i++) {
      const dest = await uniqueDestination(tmp, safeName(original.attachments[i].name, i));
      await runJxa('save_attachment', { id, mailbox: original.mailbox, attachment_index: i, dest_path: dest.path });
      forwarded.push(dest.path);
    }
    const files = [...(await checkAttachmentFiles(forwarded)), ...extra];

    const state = await runJxa('create_draft', {
      ...recipients,
      subject: prefixSubject('Fwd', original.subject),
      body: forwardBody(body, original),
      attachments: files.map((f) => f.path),
      visible: config.draftWindowVisible,
      drafts_mailbox: config.draftsMailbox,
      budget_ms: config.jxaBudgetMs,
    });
    const result = draftResult(state, files, {
      forward_mode: 'fallback',
      forwarded_from: { id: original.id, mailbox: original.mailbox, subject: original.subject, sender: original.sender },
      forwarded_attachments: forwarded.length,
    });
    // Les copies temporaires ont été supprimées : leur chemin n'a plus de sens pour l'appelant.
    for (const a of result.details.attachments) {
      if (a.path && a.path.startsWith(tmp)) delete a.path;
    }
    if (original.body_truncated) {
      result.warnings.push(`Le message d'origine est repris partiellement (${config.forwardBodyMaxChars} premiers caractères).`);
    }
    return result;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

export function registerForwardTools(server) {
  server.registerTool(
    'forward_email',
    {
      title: 'Créer un brouillon de transfert',
      description:
        "Crée un brouillon de transfert d'un message (message d'origine repris dans le corps, pièces jointes d'origine réattachées) et NE L'ENVOIE PAS. " +
        "Renvoie draft_id et un aperçu texte complet à montrer à l'utilisateur ; l'envoi passe par send_email après son accord explicite.",
      inputSchema: {
        id: messageIdArg,
        mailbox: mailboxArg,
        to: z.array(z.string().min(3)).min(1).describe('Destinataires : "adresse@exemple.fr" ou "Prénom Nom <adresse@exemple.fr>".'),
        cc: z.array(z.string().min(3)).optional().describe('Destinataires en copie.'),
        body: z.string().optional().describe("Texte d'accompagnement placé avant le message transféré."),
        attachments: z
          .array(z.string().min(1))
          .optional()
          .describe('Chemins ABSOLUS de fichiers supplémentaires à joindre, en plus des pièces jointes du message transféré.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    handler(forwardEmail),
  );
}
