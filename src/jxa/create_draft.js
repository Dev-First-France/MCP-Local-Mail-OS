// Crée un brouillon dans Mail et l'enregistre dans Drafts. N'ENVOIE JAMAIS.
function main(input, Mail) {
  const acc = getAccount(Mail, input);
  const before = draftIds(acc, input);

  const msg = Mail.OutgoingMessage({
    subject: input.subject,
    content: input.body,
    visible: input.visible,
    sender: senderFor(acc),
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
  state.draft_copy = waitForDraftCopy(before, state.subject, (input.attachments || []).length, input);
  return state;
}
