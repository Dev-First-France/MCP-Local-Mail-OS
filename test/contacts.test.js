import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanLabel, matchContacts } from '../src/contacts.js';

const CONTACTS = [
  {
    name: 'Arnaud Dupont',
    nickname: null,
    organization: 'Exemple SARL',
    emails: [
      { address: 'arnaud.dupont@exemple.fr', label: '_$!<Work>!$_' },
      { address: 'Arnaud.Dupont@exemple.fr', label: '_$!<Home>!$_' },
      { address: 'adupont@exemple.org', label: 'Perso' },
    ],
  },
  { name: 'Hélène Arnaud', nickname: 'Léna', organization: null, emails: [{ address: 'helene@exemple.fr', label: null }] },
  { name: 'Arnaud Martin', nickname: null, organization: null, emails: [] },
  { name: null, nickname: null, organization: 'Garage Exemple', emails: [{ address: 'contact@garage.exemple.fr', label: '_$!<Other>!$_' }] },
];

test('nettoie les libellés standard d\'Apple', () => {
  assert.equal(cleanLabel('_$!<Work>!$_'), 'work');
  assert.equal(cleanLabel(' Perso '), 'Perso');
  assert.equal(cleanLabel(null), null);
  assert.equal(cleanLabel(''), null);
});

test('cherche dans le nom sans tenir compte de la casse ni des accents', () => {
  const res = matchContacts(CONTACTS, 'ARNAUD', 20);
  assert.deepEqual(res.contacts.map((c) => c.name), ['Arnaud Dupont', 'Hélène Arnaud']);
  assert.equal(res.total_matches, 2);
  assert.equal(res.without_email, 1);
  assert.equal(res.contacts_searched, 4);
  assert.deepEqual(matchContacts(CONTACTS, 'helene', 20).contacts.map((c) => c.name), ['Hélène Arnaud']);
});

test('exige tous les mots, dans n\'importe quel champ', () => {
  assert.deepEqual(matchContacts(CONTACTS, 'dupont arnaud', 20).contacts.map((c) => c.name), ['Arnaud Dupont']);
  assert.deepEqual(matchContacts(CONTACTS, 'arnaud sarl', 20).contacts.map((c) => c.name), ['Arnaud Dupont']);
  assert.deepEqual(matchContacts(CONTACTS, 'lena', 20).contacts.map((c) => c.name), ['Hélène Arnaud']);
  assert.deepEqual(matchContacts(CONTACTS, 'garage.exemple', 20).contacts.map((c) => c.name), ['Garage Exemple']);
  assert.equal(matchContacts(CONTACTS, 'arnaud durand', 20).total_matches, 0);
});

test('renvoie les adresses sans doublon, avec leur libellé', () => {
  const [contact] = matchContacts(CONTACTS, 'dupont', 20).contacts;
  assert.deepEqual(contact, {
    name: 'Arnaud Dupont',
    organization: 'Exemple SARL',
    emails: [
      { address: 'arnaud.dupont@exemple.fr', label: 'work' },
      { address: 'adupont@exemple.org', label: 'Perso' },
    ],
  });
});

test('une fiche sans nom prend celui de son organisation', () => {
  const [contact] = matchContacts(CONTACTS, 'garage', 20).contacts;
  assert.deepEqual(contact, { name: 'Garage Exemple', emails: [{ address: 'contact@garage.exemple.fr', label: 'other' }] });
});

test('signale un résultat tronqué', () => {
  const res = matchContacts(CONTACTS, 'exemple', 1);
  assert.equal(res.returned, 1);
  assert.equal(res.total_matches, 3);
  assert.equal(res.truncated, true);
});
