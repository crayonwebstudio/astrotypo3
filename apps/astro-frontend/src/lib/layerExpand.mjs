// Layers tree auto-expand for the builder.
//
// Why this exists: by default every component's layer 'open'
// attribute is unset, so the Layers panel loads collapsed ("Body - 8"
// only) and a layer expands only when its caret is clicked or a
// component is selected. The builder wants the tree expanded on load.
//
// Mechanism, from the installed GrapesJS 0.23.8 source (not DOM
// clicks): LayerManager.setOpen(component, value) sets the component
// 'open' attribute, LayerManager.getComponents(component) lists its
// layerable children, and LayerManager.isOpen reads the state. The
// layer item view listens to 'change:open' and toggles the 'open'
// class, and the theme CSS shows children only under an open item:
// .gjs-layer>.gjs-layer-children{display:none} and
// .gjs-layer.open>.gjs-layer-children{display:block}.
// So opening every layer that has children, recursively from the
// layer root, makes Body and its children visible immediately.
//
// Returns false when the layer root is not set yet (LayerManager sets
// its root on the editor 'load' event, so a call before load is a
// no-op by design); the builder calls this both on 'load' and after
// every page load through applyPage, which covers both orders.
export function expandLayers(editor) {
  try {
    if (!editor || !editor.Layers) return false;
    const layers = editor.Layers;
    const root = layers.getRoot();
    if (!root) return false;
    const walk = (cmp) => {
      const kids = layers.getComponents(cmp);
      if (kids.length) {
        layers.setOpen(cmp, true);
        kids.forEach(walk);
      }
    };
    walk(root);
    return true;
  } catch {
    return false;
  }
}
