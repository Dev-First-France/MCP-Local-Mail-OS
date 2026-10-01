// Fonctions pures sur la liste à plat des boîtes renvoyée par Mail.

export function buildTree(flat) {
  const nodes = new Map();
  for (const box of flat) nodes.set(box.path, { ...box, children: [] });
  const roots = [];
  for (const node of nodes.values()) {
    const cut = node.path.lastIndexOf('/');
    const parent = cut === -1 ? undefined : nodes.get(node.path.slice(0, cut));
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export function isInside(path, ancestor) {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

// Nom d'une nouvelle boîte (nom feuille, pas un chemin). Refusé : vide, « / » (séparateur de chemin
// dans Mail), caractères de contrôle, espaces de bord (Mail les conserve, et le chemin devient
// impossible à deviner). Renvoie null si le nom est acceptable, sinon le motif du refus.
export function mailboxNameProblem(name) {
  if (typeof name !== 'string' || name.length === 0) return 'Le nom de la boîte est vide.';
  if (name !== name.trim()) return 'Le nom de la boîte ne doit pas commencer ni finir par un espace.';
  if (name.includes('/')) return 'Le nom de la boîte ne doit pas contenir « / » : pour créer une sous-boîte, indiquez la boîte parente dans "parent".';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Le nom de la boîte contient un caractère de contrôle.';
  if (name.length > 200) return 'Le nom de la boîte est trop long (200 caractères au plus).';
  return null;
}
