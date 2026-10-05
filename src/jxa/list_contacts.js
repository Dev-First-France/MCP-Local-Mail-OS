// Fiches de l'application Contacts : nom, surnom, organisation, adresses électroniques.
// Mail n'intervient pas. Contacts est lancé par le premier événement s'il est fermé :
// dans ce cas il est refermé après la lecture. Ouvert par l'utilisateur, il est laissé tel quel.
const MAIL_NOT_REQUIRED = true;

function main(input) {
  const Contacts = Application('Contacts');
  const wasRunning = Contacts.running();
  try {
    return readContacts(Contacts.people);
  } finally {
    if (!wasRunning) {
      try {
        Contacts.quit();
      } catch (e) {}
    }
  }
}

function readContacts(people) {
  // Lectures en masse (≈ 0,1 s chacune) ; nouvel essai si une fiche change entre deux événements.
  for (let attempt = 0; attempt < 3; attempt++) {
    const names = people.name();
    const nicknames = people.nickname();
    const organizations = people.organization();
    const addresses = people.emails.value();
    const labels = people.emails.label();
    const n = names.length;
    const aligned =
      [nicknames, organizations, addresses, labels].every(function (c) { return c.length === n; }) &&
      addresses.every(function (a, i) { return (a || []).length === (labels[i] || []).length; });
    if (!aligned) continue;
    return {
      contacts: names.map(function (name, i) {
        return {
          name: name || null,
          nickname: nicknames[i] || null,
          organization: organizations[i] || null,
          emails: (addresses[i] || []).map(function (address, j) {
            return { address: address, label: labels[i][j] || null };
          }),
        };
      }),
    };
  }
  fail('OSASCRIPT_ERROR', 'Le carnet d\'adresses change pendant la lecture. Réessayez dans quelques secondes.');
}
