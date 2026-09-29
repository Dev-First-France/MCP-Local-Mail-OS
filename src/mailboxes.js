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
