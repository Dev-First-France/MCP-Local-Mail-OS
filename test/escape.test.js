import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeAppleScriptString, toAppleScriptLiteral } from '../src/escape.js';

test('échappe les backslashes avant les guillemets', () => {
  assert.equal(escapeAppleScriptString('a\\b'), 'a\\\\b');
  assert.equal(escapeAppleScriptString('dit "bonjour"'), 'dit \\"bonjour\\"');
  assert.equal(escapeAppleScriptString('\\"'), '\\\\\\"');
});

test('une tentative d\'injection reste dans le littéral', () => {
  const evil = '" & (do shell script "rm -rf ~") & "';
  const literal = toAppleScriptLiteral(evil);
  // Tous les guillemets de la charge sont échappés : seuls ceux des extrémités délimitent le littéral.
  assert.equal(literal, '"\\" & (do shell script \\"rm -rf ~\\") & \\""');
  assert.equal(literal.replace(/\\\\/g, '').replace(/\\"/g, '').match(/"/g).length, 2);
});

test('les retours à la ligne et tabulations sortent du littéral', () => {
  assert.equal(toAppleScriptLiteral('a\nb'), '"a" & linefeed & "b"');
  assert.equal(toAppleScriptLiteral('a\r\nb'), '"a" & linefeed & "b"');
  assert.equal(toAppleScriptLiteral('a\rb'), '"a" & return & "b"');
  assert.equal(toAppleScriptLiteral('a\tb'), '"a" & tab & "b"');
  assert.equal(toAppleScriptLiteral('\n'), 'linefeed');
  assert.equal(toAppleScriptLiteral(''), '""');
});

test('conserve accents, apostrophes et espaces finaux', () => {
  assert.equal(toAppleScriptLiteral("école d'été"), '"école d\'été"');
  assert.equal(toAppleScriptLiteral('Projets '), '"Projets "');
});

test('refuse ce qui n\'est pas une chaîne ou contient un caractère nul', () => {
  assert.throws(() => escapeAppleScriptString(42), TypeError);
  assert.throws(() => escapeAppleScriptString('a\0b'), RangeError);
});
