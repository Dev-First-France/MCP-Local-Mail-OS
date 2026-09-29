// Crée un brouillon dans Mail, l'enregistre dans les brouillons du compte expéditeur. N'ENVOIE JAMAIS.
function main(input, Mail) {
  const account = getAccount(Mail, input.from_account);
  const drafts = draftsBoxOf(Mail, account);
  const before = idsIn(drafts);

  const msg = Mail.OutgoingMessage({
    subject: input.subject,
    content: input.body,
    visible: input.visible,
    sender: senderFor(account, input.from_address),
  });
  Mail.outgoingMessages.push(msg);
  setRecipients(Mail, msg, input);

  (input.attachments || []).forEach(function (file) {
    msg.content.attachments.push(Mail.Attachment({ fileName: Path(file) }));
    delay(0.5);
  });
  if ((input.attachments || []).length > 0) delay(0.5);

  const id = msg.id();
  msg.save();
  const state = stateOf(msg, id);
  state.from_account = account.name;
  state.draft_copy = waitForDraftCopy(drafts, before, state.subject, (input.attachments || []).length, input);
  return state;
}
