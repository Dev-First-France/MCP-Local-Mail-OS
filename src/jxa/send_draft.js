// Demande l'envoi puis VÉRIFIE que le message a quitté la composition.
// Le retour de « send » n'est pas fiable : une extension (Antidote) peut intercepter l'envoi.
function main(input, Mail) {
  const msg = outgoingById(Mail, input.outgoing_id);
  const state = stateOf(msg, input.outgoing_id);
  const answered = msg.send();
  let stillComposing = true;
  while (stillComposing && !outOfTime(input)) {
    delay(1);
    const ids = orNull(function () { return Mail.outgoingMessages.id(); }) || [];
    stillComposing = ids.indexOf(input.outgoing_id) !== -1;
  }
  state.send_answered = answered;
  state.still_composing = stillComposing;
  return state;
}
