// Builds the hidden shapes of a card side, for the Image Occlusion tests.

export function shapes(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}
