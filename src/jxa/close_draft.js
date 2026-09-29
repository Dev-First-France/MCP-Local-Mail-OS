// Ferme sans enregistrer un brouillon en cours de composition (nettoyage après un échec).
function main(input, Mail) {
  const ids = orNull(function () { return Mail.outgoingMessages.id(); }) || [];
  if (ids.indexOf(input.outgoing_id) === -1) return { closed: false };
  Mail.outgoingMessages.byId(input.outgoing_id).close({ saving: 'no' });
  return { closed: true };
}
