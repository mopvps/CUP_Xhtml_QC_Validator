window.RULES_CONFIG = [
  {
    id: 'sup-must-have-anchor',
    name: 'Sup must contain anchor',
    description: '<sup> tags must contain an <a> tag inside them',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'sup-serial-check',
    name: 'Superscript Serial Check',
    description: 'Checks that <sup> numbers are sequential — separately for body sups and footnote sups (<li class="fn">)',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'sup-link-check',
    name: 'Sup Link Check',
    description: 'Checks that all <a> tags inside <sup> have valid internal or external links',
    severity: 'error',
    enabled: false,
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
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'p-missing-class',
    name: 'Paragraph Missing Class',
    description: 'Checks that every <p> tag has a non-empty class attribute (except inside <blockquote>)',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'span-outside-li',
    name: 'Span Outside List Item',
    description: 'Checks that no <span> is a direct child of <ul> or <ol> — it must be inside a <li>',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'unlinked-reference',
    name: 'Unlinked Cross-Reference',
    description: 'Checks that cross-references like "Figure 1", "Table 2" etc. are wrapped in an anchor tag',
    severity: 'warn',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'bm-unlinked-range-number',
    name: 'BM Unlinked Range Number',
    description: 'In _bm* files, numbers after a dash or dash entity must be wrapped in an <a> tag',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'pagebreak-check',
    name: 'Pagebreak Check',
    description: 'Checks that all expected page breaks (from Excel) exist in each XHTML file',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'pagebreak-wrong-file',
    name: 'Pagebreak in Wrong File',
    description: 'Flags pagebreaks found in a file that belong to a different file based on Excel page ranges',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'pagebreak-duplicate',
    name: 'Duplicate Pagebreak',
    description: 'Checks if the same pagebreak aria-label appears in more than one XHTML file',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'pagebreak-sequence',
    name: 'Pagebreak Sequence Order',
    description: 'Checks that pagebreaks appear in ascending order within each file (supports both roman and arabic numerals)',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  },
  {
    id: 'stylesheet-class-check',
    name: 'Stylesheet Class Check',
    description: 'Checks that every class used in XHTML files is defined in the OEBPS CSS stylesheet',
    severity: 'warn',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'epub-type-id-link-check',
    name: 'Cross link Id Not linked',
    description: 'Checks that every epub:type="footnote" or epub:type="biblioentry" element has its id referenced by at least one anchor tag across all XHTML files',
    severity: 'warn',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'xref-text-match',
    name: 'Xref Text Match',
    description: 'Checks that <a class="xref"> anchor text matches the <span class="label"> text it points to (supports Fig./Figure, Tab./Table, cross-file)',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'caption-label-unreferenced',
    name: 'Caption Label Unreferenced',
    description: 'Checks that every <span class="label"> inside a figcaption or tblcaption that contains "Figure" or "Table" text is referenced by at least one <a class="xref"> across all files',
    severity: 'error',
    enabled: true,
    preset: 'recommended'
  },
  {
    id: 'figure-missing-label',
    name: 'Figure Missing Label',
    description: 'Checks that every <figure> tag has a <figcaption> containing a <span class="label"> with Figure or Table text',
    severity: 'error',
    enabled: false,
    preset: 'recommended'
  }
];
