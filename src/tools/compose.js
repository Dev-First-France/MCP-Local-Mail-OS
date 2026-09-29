import { z } from 'zod';
import { requireDefaultAccount } from '../accounts.js';
import { config } from '../config.js';
import { ErrorCode, MailMcpError } from '../errors.js';
import { runJxa } from '../osascript.js';
import { checkAttachmentFiles } from '../paths.js';
import { makeDraftId, parseDraftId, renderPreview } from '../preview.js';
import { handler } from '../result.js';
import { accountArg, confirmArg, requireConfirmation } from './shared.js';

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

// Accepte "adresse@exemple.fr" ou "Prénom Nom <adresse@exemple.fr>".
export function parseRecipient(text) {
  const raw = String(text).trim();
  const m = /^(.*)<([^<>]+)>$/.exec(raw);
  const address = (m ? m[2] : raw).trim();
  const name = m ? m[1].trim().replace(/^"(.*)"$/, '$1').trim() : '';
  if (!EMAIL.test(address) || /[\r\n\0]/.test(raw)) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, `Adresse de destinataire invalide : ${JSON.stringify(text)}`);
  }
  return name ? { name, address } : { address };
}

export const parseRecipients = (list) => (list || []).map(parseRecipient);

const recipientList = (what) =>
  z.array(z.string().min(3)).describe(`${what} : adresses, au format "adresse@exemple.fr" ou "Prénom Nom <adresse@exemple.fr>".`);

export const attachmentsArg = z
  .array(z.string().min(1))
  .optional()
  .describe('Chemins ABSOLUS de fichiers existants sur ce Mac à joindre. Vérifiés avant toute création de brouillon.');

export const fromAccountArg = accountArg.optional();
export const fromAddressArg = z
  .string()
  .min(3)
  .optional()
  .describe("Adresse d'expédition, parmi celles du compte expéditeur. Omise : la première adresse du compte.");

const WINDOW_NOTE =
  'Le brouillon est ouvert dans une fenêtre de composition de Mail et enregistré dans les brouillons du compte expéditeur. ' +
  "Il n'est PAS envoyé. Montrez l'aperçu à l'utilisateur ; l'envoi passe par send_email après son accord explicite.";

// Construit la réponse commune à draft_email et forward_email à partir de l'état relu dans Mail.
export function draftResult(state, files, extra = {}) {
  const inDraft = state.draft_copy ? state.draft_copy.attachments : null;
  const attachments = inDraft && inDraft.length > 0 ? inDraft.map((a) => ({ name: a.name, size: a.size })) : files;
  const warnings = [];
  if (!state.draft_copy) {
    warnings.push("La copie du brouillon n'est pas encore visible dans les brouillons du compte : pièces jointes non vérifiées.");
  } else if (inDraft.length < files.length) {
    warnings.push(`Seulement ${inDraft.length} pièce(s) jointe(s) sur ${files.length} dans le brouillon enregistré : vérifiez dans Mail.`);
  }
  return {
    draft_id: makeDraftId(state),
    sent: false,
    from_account: state.from_account,
    draft_message: state.draft_copy
      ? { account: state.draft_copy.account, mailbox: state.draft_copy.mailbox, id: state.draft_copy.id }
      : null,
    preview: renderPreview({ state, attachments, warnings }),
    details: {
      from: state.sender,
      to: state.to,
      cc: state.cc,
      bcc: state.bcc,
      subject: state.subject,
      body: state.content,
      attachments: attachments.map((a) => {
        // Mail renvoie les noms en forme décomposée (NFD) : comparaison après normalisation.
        const file = files.find((f) => f.name.normalize('NFC') === String(a.name).normalize('NFC'));
        return file ? { name: a.name, size: a.size ?? file.size, path: file.path } : a;
      }),
      ...extra,
    },
    warnings,
    next_step: WINDOW_NOTE,
  };
}

async function draftEmail(args) {
  const { to, cc, bcc, subject, body, from_account, from_address, attachments } = args;
  const { reply_to_account, reply_to_mailbox, reply_to_id } = args;
  const recipients = { to: parseRecipients(to), cc: parseRecipients(cc), bcc: parseRecipients(bcc) };
  const isReply = reply_to_id !== undefined;
  if (isReply && !(reply_to_account && reply_to_mailbox)) {
    throw new MailMcpError(
      ErrorCode.INVALID_ARGUMENT,
      'reply_to_account et reply_to_mailbox sont obligatoires avec reply_to_id : un message est identifié par (account, mailbox, id).',
    );
  }
  if (!isReply && recipients.to.length === 0) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, 'Au moins un destinataire "to" est requis.');
  }
  const files = await checkAttachmentFiles(attachments);

  if (isReply) {
    const { replyDraft } = await import('./reply.js');
    return replyDraft({
      recipients,
      subject,
      body,
      files,
      from_account,
      from_address,
      source: { account: reply_to_account, mailbox: reply_to_mailbox, id: reply_to_id },
    });
  }

  const state = await runJxa('create_draft', {
    ...recipients,
    subject,
    body,
    from_account: from_account || (await requireDefaultAccount()),
    from_address,
    attachments: files.map((f) => f.path),
    visible: config.draftWindowVisible,
    budget_ms: config.jxaBudgetMs,
  });
  return draftResult(state, files);
}

async function sendEmail({ draft_id, confirm }) {
  // Vérifié ici, avant tout appel à Mail.
  requireConfirmation(confirm, "rien n'a été envoyé");
  const parsed = parseDraftId(draft_id);
  if (!parsed) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, `draft_id invalide : ${JSON.stringify(draft_id)}. Utilisez celui renvoyé par draft_email ou forward_email.`);
  }

  const current = await runJxa('draft_state', { outgoing_id: parsed.outgoingId });
  const currentId = makeDraftId(current);
  if (currentId !== draft_id.trim()) {
    throw new MailMcpError(
      ErrorCode.DRAFT_CHANGED,
      "Le brouillon ne correspond plus à l'aperçu validé (il a été modifié dans Mail, ou Mail a été relancé et ce numéro désigne un autre message). " +
        "Rien n'a été envoyé. Montrez le nouvel aperçu à l'utilisateur et, s'il est d'accord, rappelez send_email avec le nouveau draft_id.",
      { draft_id: currentId, preview: renderPreview({ state: current, title: 'ÉTAT ACTUEL DU BROUILLON — NON ENVOYÉ' }) },
    );
  }
  if (current.to.length + current.cc.length + current.bcc.length === 0) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, "Le brouillon n'a aucun destinataire. Rien n'a été envoyé.");
  }

  const res = await runJxa('send_draft', { outgoing_id: parsed.outgoingId, budget_ms: config.sendCheckBudgetMs });
  const summary = { draft_id, from: res.sender, to: res.to, cc: res.cc, bcc: res.bcc, subject: res.subject };
  if (!res.still_composing) {
    return { sent: true, status: 'sent', ...summary };
  }
  return {
    sent: false,
    status: 'awaiting_manual_send',
    ...summary,
    message:
      "L'envoi a été demandé à Mail mais le message n'est PAS parti : il est toujours en cours de composition. " +
      "Une extension de Mail (par exemple le correcteur Antidote) intercepte l'envoi et attend une action dans Mail. " +
      'Terminez dans Mail : validez la correction puis cliquez sur Envoyer dans la fenêtre du message. ' +
      'Ne rappelez pas send_email pour ce brouillon.',
  };
}

export function registerComposeTools(server) {
  server.registerTool(
    'draft_email',
    {
      title: 'Créer un brouillon',
      description:
        "Crée un brouillon dans Mail (brouillons du compte expéditeur) et NE L'ENVOIE PAS. Renvoie draft_id et un aperçu texte complet " +
        "(expéditeur, destinataires, sujet, corps, pièces jointes) à montrer à l'utilisateur. " +
        'Avec reply_to_account, reply_to_mailbox et reply_to_id, crée une réponse au message indiqué (fil de discussion conservé, ' +
        'message d\'origine cité) : "to" peut alors être vide pour répondre à l\'expéditeur, et le compte expéditeur est par défaut celui du message.',
      inputSchema: {
        to: recipientList('Destinataires principaux').default([]),
        cc: recipientList('Destinataires en copie').optional(),
        bcc: recipientList('Destinataires en copie cachée').optional(),
        subject: z.string().max(998).describe('Objet. Pour une réponse, laisser vide pour reprendre "Re: objet d\'origine".').default(''),
        body: z.string().describe('Corps du message en texte brut.'),
        from_account: fromAccountArg.describe(
          'Compte expéditeur (nom ou adresse). Omis : le compte par défaut (voir list_accounts), ou pour une réponse le compte du message d\'origine.',
        ),
        from_address: fromAddressArg,
        reply_to_account: accountArg.optional().describe('Compte du message auquel répondre.'),
        reply_to_mailbox: z.string().min(1).optional().describe('Boîte du message auquel répondre.'),
        reply_to_id: z.number().int().optional().describe('Id du message auquel répondre.'),
        attachments: attachmentsArg,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    handler(draftEmail),
  );

  server.registerTool(
    'send_email',
    {
      title: 'Envoyer un brouillon',
      description:
        "N'envoie que si confirm vaut true ; sinon renvoie l'erreur CONFIRMATION_REQUIRED. " +
        "Ne jamais appeler ce tool sans avoir montré l'aperçu du brouillon à l'utilisateur et obtenu son accord explicite dans la conversation. " +
        "Refuse aussi si le brouillon a changé depuis l'aperçu (DRAFT_CHANGED). " +
        'Le résultat indique si le message est réellement parti : avec "sent": false et "status": "awaiting_manual_send", ' +
        "une extension de Mail (Antidote) retient l'envoi et l'utilisateur doit cliquer sur Envoyer dans Mail.",
      inputSchema: {
        draft_id: z.string().min(1).describe('Identifiant renvoyé par draft_email ou forward_email.'),
        confirm: confirmArg,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    handler(sendEmail),
  );
}
