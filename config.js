window.RULES_CONFIG = [
  {
    id: 'sup-must-have-anchor',
    name: 'Sup must contain anchor',
    description: '<sup> tags must contain an <a> tag inside them',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'sup-serial-check',
    name: 'Superscript Serial Check',
    description: 'Checks that <sup> numbers are sequential — separately for body sups and footnote sups (<li class="fn">)',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'sup-link-check',
    name: 'Sup Link Check',
    description: 'Checks that all <a> tags inside <sup> have valid internal or external links',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'anchor-link-check',
    name: 'Anchor Link Check',
    description: 'Checks that all <a> tags outside <sup> have valid internal, external or cross-file links',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'missing-images',
    name: 'Missing Images',
    description: 'Checks that all <img> src paths exist in the project folder (jpg, png, jpeg)',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'duplicate-id-check',
    name: 'Duplicate ID Check',
    description: 'Checks that no id attribute is duplicated across all project files',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'p-missing-class',
    name: 'Paragraph Missing Class',
    description: 'Checks that every <p> tag has a non-empty class attribute (except inside <blockquote>)',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'span-outside-li',
    name: 'Span Outside List Item',
    description: 'Checks that no <span> is a direct child of <ul> or <ol> — it must be inside a <li>',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'unlinked-reference',
    name: 'Unlinked Cross-Reference',
    description: 'Checks that cross-references like "Figure 1", "Table 2" etc. are wrapped in an anchor tag',
    severity: 'warn',
    enabled: true,
    preset: 'recommended'
  }
];
