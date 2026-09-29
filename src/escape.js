// Échappement d'une chaîne pour un littéral AppleScript entre guillemets.
//
// À n'utiliser que pour un repli AppleScript : la voie normale est JXA avec
// des scripts statiques et des entrées passées en JSON sur stdin.
// AppleScript ne connaît que deux séquences dans un littéral : \\ et \".
// Les retours à la ligne sont donc sortis du littéral et recollés avec
// les constantes `return` / `linefeed` / `tab`.
export function escapeAppleScriptString(value) {
  if (typeof value !== 'string') {
    throw new TypeError('escapeAppleScriptString attend une chaîne');
  }
  if (value.includes('\0')) {
    throw new RangeError('Caractère nul interdit dans une chaîne AppleScript');
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Renvoie une expression AppleScript complète (guillemets compris).
export function toAppleScriptLiteral(value) {
  const parts = escapeAppleScriptString(value).split(/(\r\n|\r|\n|\t)/);
  const out = [];
  for (const part of parts) {
    if (part === '\r\n' || part === '\n') out.push('linefeed');
    else if (part === '\r') out.push('return');
    else if (part === '\t') out.push('tab');
    else if (part !== '') out.push(`"${part}"`);
  }
  return out.length === 0 ? '""' : out.join(' & ');
}
