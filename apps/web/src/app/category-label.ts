const LABELS: Record<string, string> = {
  concrete: 'Concrete',
  'reinforcing-steel': 'Reinforcing steel',
  'structural-steel': 'Structural steel',
  timber: 'Timber',
  masonry: 'Masonry',
  insulation: 'Insulation',
  'cement-mortar': 'Cement and mortar',
};

/** A readable heading for a category slug. An unknown slug becomes "Like this". */
export function categoryLabel(slug: string): string {
  const words = slug.replaceAll('-', ' ');
  return LABELS[slug] ?? words.charAt(0).toUpperCase() + words.slice(1);
}
