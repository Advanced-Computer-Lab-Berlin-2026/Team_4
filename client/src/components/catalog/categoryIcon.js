const icons = {
  'power-tools': 'power',
  'hand-tools': 'tool',
  'ladders-access': 'ladder',
  garden: 'garden',
  'camping-outdoors': 'tent',
  'cleaning-equipment': 'clean',
};

export default function categoryIcon(slug) {
  return icons[slug] || 'box';
}
