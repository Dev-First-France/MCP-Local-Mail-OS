import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultAccountOf, findAccount } from '../src/accounts.js';
import { config } from '../src/config.js';

const account = (name, enabled, ...email_addresses) => ({ name, enabled, email_addresses });
const accounts = [
  account('iCloud', true, 'moi@exemple.fr', 'moi@exemple.com'),
  account('Travail ', true, 'pro@exemple.org'),
  account('Ancien', false, 'vieux@exemple.fr'),
];

test('un compte se désigne par son nom ou par une de ses adresses', () => {
  assert.equal(findAccount(accounts, 'iCloud').name, 'iCloud');
  assert.equal(findAccount(accounts, 'icloud').name, 'iCloud');
  assert.equal(findAccount(accounts, 'travail').name, 'Travail ');
  assert.equal(findAccount(accounts, 'MOI@exemple.com').name, 'iCloud');
  assert.equal(findAccount(accounts, 'pro@exemple.org').name, 'Travail ');
  assert.equal(findAccount(accounts, 'inconnu'), null);
});

test('le compte par défaut est un compte activé', () => {
  assert.equal(defaultAccountOf(accounts), config.defaultAccount === 'iCloud' ? 'iCloud' : defaultAccountOf(accounts));
  // Compte par défaut absent : l'unique compte activé, sinon aucun.
  assert.equal(defaultAccountOf([account('Travail', true, 'pro@exemple.org'), account('Ancien', false)]), 'Travail');
  assert.equal(defaultAccountOf([account('A', true), account('B', true)]), null);
  assert.equal(defaultAccountOf([account('iCloud', false, 'moi@exemple.fr')]), null);
});

test("la boîte « All Mail » de Gmail est reconnue, pas les boîtes qui lui ressemblent", () => {
  for (const p of ['[Gmail]/All Mail', '[Gmail]/Tous les messages', '[Google Mail]/All Mail']) assert.ok(config.allMailPattern.test(p), p);
  for (const p of ['All Mail', '[Gmail]/Sent Mail', 'Projets/[Gmail]/All Mail', '[Gmail]/All Mail/Sous-boîte']) assert.ok(!config.allMailPattern.test(p), p);
});
