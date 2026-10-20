// Frontend editing bridge protocol.
// Messages between the preview iframe or window and the editor must match a
// fixed type set, the expected origin and a small schema. Anything else is rejected.
export const EDIT_MESSAGE_TYPES = ['astro-builder:select', 'astro-builder:update-text', 'astro-builder:update-props', 'astro-builder:ready'];

export function validateEditorMessage(message, actualOrigin, expectedOrigin) {
  const errors = [];
  if (!message || typeof message !== 'object') return { valid: false, errors: ['message must be an object'] };
  if (!EDIT_MESSAGE_TYPES.includes(message.type)) errors.push('unknown message type');
  if (expectedOrigin && actualOrigin !== expectedOrigin) errors.push('origin mismatch');
  if (message.type !== 'astro-builder:ready' && !message.elementId) errors.push('elementId is required');
  if (message.type === 'astro-builder:update-text' && typeof message.text !== 'string') errors.push('text must be a string');
  if (message.type === 'astro-builder:update-props' && (typeof message.props !== 'object' || message.props === null)) errors.push('props must be an object');
  return { valid: errors.length === 0, errors };
}

export function createSelectMessage(elementId) {
  return { type: 'astro-builder:select', elementId };
}
