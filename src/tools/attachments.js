import { stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { ErrorCode, MailMcpError } from '../errors.js';
import { runJxa } from '../osascript.js';
import { assertInside, ensureTargetDir, uniqueDestination, validateAttachmentName } from '../paths.js';
import { handler } from '../result.js';
import { accountArg, mailboxArg, messageIdArg } from './shared.js';

export async function saveAttachment({ account, mailbox, id, attachment_name, target_dir }) {
  // Tous les contrôles de chemin ont lieu ici, avant le moindre appel à Mail.
  const name = validateAttachmentName(attachment_name);
  const dir = await ensureTargetDir(target_dir ?? config.defaultDownloadDir);
  const dest = await uniqueDestination(dir, name);

  const res = await runJxa('save_attachment', { account, mailbox, id, attachment_name: name, dest_path: dest.path });

  let info;
  try {
    info = await stat(dest.path);
  } catch {
    throw new MailMcpError(
      ErrorCode.OSASCRIPT_ERROR,
      `Mail a accepté la commande mais le fichier est absent : ${dest.path}. Mail est une application en bac à sable : ` +
        'essayez un dossier cible dans ~/Downloads.',
      { dest_path: dest.path },
    );
  }
  assertInside(dir, dest.path);
  const out = { path: dest.path, name: path.basename(dest.path), original_name: res.name, size: info.size, renamed: dest.renamed };
  if (res.same_name_count > 1) {
    out.note = `Le message contient ${res.same_name_count} pièces jointes portant ce nom : la première a été enregistrée.`;
  }
  return out;
}

export function registerAttachmentTools(server) {
  server.registerTool(
    'save_attachment',
    {
      title: 'Enregistrer une pièce jointe',
      description:
        'Enregistre sur disque une pièce jointe d\'un message et renvoie son chemin absolu. Le dossier cible est créé au besoin. ' +
        'Si un fichier du même nom existe, un suffixe -1, -2… est ajouté (rien n\'est écrasé). ' +
        'Le nom de la pièce jointe ne doit contenir ni "/" ni "..".',
      inputSchema: {
        account: accountArg,
        mailbox: mailboxArg,
        id: messageIdArg,
        attachment_name: z.string().min(1).describe('Nom exact de la pièce jointe, tel que renvoyé par read_message.'),
        target_dir: z
          .string()
          .min(1)
          .default('~/Downloads/mail-mcp')
          .describe('Dossier de destination (chemin absolu ou commençant par ~).'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    handler(saveAttachment),
  );
}
