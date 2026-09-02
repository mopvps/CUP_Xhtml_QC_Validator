window.RULES = {
  'sup-must-have-anchor': function (parsed, ruleCfg) {
    const issues = [];
    const supElements = parsed.elements.filter((el) => el.tag === 'sup');
    const supNodes = parsed.dom.querySelectorAll('sup');

    supNodes.forEach((node, index) => {
      if (!node.querySelector('a')) {
        const outerHTML = node.outerHTML || '';
        const matchEl = supElements[index];

        issues.push({
          ruleId: 'sup-must-have-anchor',
          severity: ruleCfg && ruleCfg.severity ? ruleCfg.severity : 'error',
          message: '<sup> tag is missing an <a> anchor inside it',
          detail: outerHTML.replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 100),
          line: matchEl ? matchEl.line : null,
          col: 0
        });
      }
    });

    return issues;
  },

  'sup-serial-check': {
    check: function(parsed, ruleCfg) {
      const issues = [];
      const dom = parsed.dom;
      if (!dom) return issues;

      function getSupNumber(supEl) {
        const text = (supEl.textContent || '').trim();
        const num = parseInt(text, 10);
        return isNaN(num) ? null : num;
      }

      function isInFootnote(el) {
        let node = el.parentElement;
        while (node) {
          const tag = (node.tagName || '').toLowerCase();
          const cls = (node.getAttribute('class') || '').split(/\s+/);
          if (tag === 'li' && cls.includes('fn')) return true;
          node = node.parentElement;
        }
        return false;
      }

      function findGaps(numbers) {
        if (numbers.length < 2) return [];
        const sorted = numbers.slice().sort((a, b) => a - b);
        const gaps = [];
        for (let i = sorted[0]; i <= sorted[sorted.length - 1]; i++) {
          if (!numbers.includes(i)) gaps.push(i);
        }
        return gaps;
      }

      const bodySups = [];
      const footnoteSups = [];

      // For footnotes: just grab the FIRST <sup> inside each <li class="fn">
      const fnItems = Array.from(dom.querySelectorAll('li.fn, li[class="fn"]'));
      fnItems.forEach(li => {
        const firstSup = li.querySelector('sup');
        if (!firstSup) return;
        const num = parseInt((firstSup.textContent || '').trim(), 10);
        if (!isNaN(num)) footnoteSups.push(num);
      });

      // For body: all <sup> NOT inside <li class="fn">
      const allSups = Array.from(dom.querySelectorAll('sup'));
      allSups.forEach(sup => {
        if (isInFootnote(sup)) return;
        const num = parseInt((sup.textContent || '').trim(), 10);
        if (!isNaN(num)) bodySups.push(num);
      });

      const bodyGaps = findGaps(bodySups);
      const footnoteGaps = findGaps(footnoteSups);

      if (bodyGaps.length > 0 || footnoteGaps.length > 0) {
        issues.push({
          ruleId: 'sup-serial-check',
          severity: ruleCfg.severity,
          message: `Missing superscript numbers — Body: ${bodyGaps.length} gap(s), Footnotes: ${footnoteGaps.length} gap(s)`,
          detail: '',
          line: 0,
          col: 0,
          _custom: {
            bodySups,
            footnoteSups,
            bodyGaps,
            footnoteGaps
          }
        });
      }

      return issues;
    },

    render: function(issue, fileName) {
      const wrap = document.createElement('div');
      wrap.className = 'sup-serial-report';

      const data = issue._custom || {};
      const bodySups = data.bodySups || [];
      const footnoteSups = data.footnoteSups || [];
      const bodyGaps = new Set(data.bodyGaps || []);
      const footnoteGaps = new Set(data.footnoteGaps || []);

      function buildSequence(numbers) {
        if (numbers.length === 0) return [];
        const sorted = numbers.slice().sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const present = new Set(numbers);
        const seq = [];
        for (let i = min; i <= max; i++) {
          seq.push({ num: i, present: present.has(i) });
        }
        return seq;
      }

      function renderCircles(seq) {
        if (seq.length === 0) return '<div class="sup-serial-empty">No superscripts found</div>';

        let html = '<div class="sup-circle-grid">';
        seq.forEach(item => {
          html += `
            <div class="sup-circle-wrap">
              <div class="sup-circle ${item.present ? 'circle-present' : 'circle-missing'}">
                ${item.num}
              </div>
              ${!item.present ? '<div class="sup-circle-label">missing</div>' : ''}
            </div>
          `;
        });
        html += '</div>';
        return html;
      }

      function renderCol(title, seq, gapCount) {
        const badgeClass = gapCount > 0 ? 'badge-error' : 'badge-pass';
        const badgeText = gapCount > 0 ? gapCount + ' missing' : 'OK';
        return `
          <div class="sup-serial-col">
            <div class="sup-col-header">
              <span class="sup-col-title">${title}</span>
              <span class="sup-serial-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="sup-col-body">
              ${renderCircles(seq)}
            </div>
          </div>
        `;
      }

      const bodySeq = buildSequence(bodySups);
      const fnSeq = buildSequence(footnoteSups);

      wrap.innerHTML = `
        <div class="sup-serial-two-col">
          ${renderCol('Body', bodySeq, bodyGaps.size)}
          <div class="sup-serial-divider"></div>
          ${renderCol('Footnotes', fnSeq, footnoteGaps.size)}
        </div>
      `;

      return wrap;
    }
  },

  'sup-link-check': function(parsed, ruleCfg, fileMap) {
    const issues = [];
    const dom = parsed.dom;
    if (!dom) return issues;

    // Get all <a> tags inside <sup>
    const supAnchors = Array.from(dom.querySelectorAll('sup a'));

    // Build a set of all IDs in this file
    const allIds = new Set();
    dom.querySelectorAll('[id]').forEach(el => allIds.add(el.getAttribute('id')));

    // Build a set of all href values in this file
    const allHrefs = new Set();
    dom.querySelectorAll('[href]').forEach(el => {
      const href = el.getAttribute('href');
      if (href && href.startsWith('#')) allHrefs.add(href.slice(1));
    });

    supAnchors.forEach(anchor => {
      const href = anchor.getAttribute('href') || '';
      const id = anchor.getAttribute('id') || '';
      const text = (anchor.textContent || '').trim();

      if (!href && !id) {
        issues.push({
          ruleId: 'sup-link-check',
          severity: ruleCfg.severity,
          message: '<a> inside <sup> has no href or id',
          detail: anchor.outerHTML.replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 100),
          line: 0,
          col: 0
        });
        return;
      }

      // TYPE 1: Internal link — href="#something"
      if (href.startsWith('#')) {
        const target = href.slice(1);
        if (!allIds.has(target)) {
          issues.push({
            ruleId: 'sup-link-check',
            severity: ruleCfg.severity,
            message: `Broken internal link — target id="${target}" not found in this file`,
            detail: href,
            line: 0,
            col: 0
          });
        }
      }

      // TYPE 2 & 3: External link — href="file.xhtml" or "file.xhtml#anchor"
      else if (href && !href.startsWith('#')) {
        const [filePart, anchorPart] = href.split('#');

        // Check file exists in fileMap
        if (!fileMap || !fileMap.has(filePart)) {
          issues.push({
            ruleId: 'sup-link-check',
            severity: ruleCfg.severity,
            message: `Broken external link — file "${filePart}" not found in project`,
            detail: href,
            line: 0,
            col: 0
          });
        } else if (anchorPart) {
          // TYPE 3: Check anchor exists in the external file
          const externalParsed = fileMap.get(filePart);
          if (externalParsed && externalParsed.dom) {
            const targetEl = externalParsed.dom.getElementById(anchorPart);
            if (!targetEl) {
              issues.push({
                ruleId: 'sup-link-check',
                severity: ruleCfg.severity,
                message: `Broken external anchor — id="${anchorPart}" not found in "${filePart}"`,
                detail: href,
                line: 0,
                col: 0
              });
            }
          }
        }
      }

      // TYPE 1 REVERSE: id must have a matching href="#id" in same file
      if (id) {
        if (!allHrefs.has(id)) {
          issues.push({
            ruleId: 'sup-link-check',
            severity: ruleCfg.severity,
            message: `Orphan id="${id}" — no href="#${id}" found in this file`,
            detail: anchor.outerHTML.replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 100),
            line: 0,
            col: 0
          });
        }
      }
    });

    return issues;
  },

  'anchor-link-check': function(parsed, ruleCfg, fileMap, allFiles) {
    const issues = [];
    const dom = parsed.dom;
    if (!dom) return issues;

    // Map anchor by href+id signature to line number
    const anchorLineMap = new Map();
    parsed.elements.filter(el => el.tag === 'a').forEach(el => {
      const key = (el.attrs.href || '') + '|' + (el.attrs.id || '');
      if (!anchorLineMap.has(key)) anchorLineMap.set(key, el.line);
    });

    function getAnchorLine(anchor) {
      const href = (anchor.getAttribute('href') || '').trim();
      const id = (anchor.getAttribute('id') || '').trim();
      const key = href + '|' + id;
      return anchorLineMap.get(key) || 0;
    }

    // Build set of all IDs in this file
    const allIds = new Set();
    dom.querySelectorAll('[id]').forEach(el => allIds.add(el.getAttribute('id')));

    // Build set of all href targets in this file
    const allHrefs = new Set();
    dom.querySelectorAll('[href]').forEach(el => {
      const href = el.getAttribute('href') || '';
      if (href.startsWith('#')) allHrefs.add(href.slice(1));
    });

    // Build set of all href targets across ALL files (for backlink check)
    const allProjectHrefs = new Set();
    if (fileMap) {
      fileMap.forEach((fileParsed, fileName) => {
        if (fileParsed && fileParsed.dom) {
          fileParsed.dom.querySelectorAll('[href]').forEach(el => {
            const href = el.getAttribute('href') || '';
            if (href.startsWith('#')) allProjectHrefs.add(href.slice(1));
            if (href.includes('#')) {
              const anchor = href.split('#')[1];
              if (anchor) allProjectHrefs.add(anchor);
            }
          });
        }
      });
    }

    // Get all <a> tags OUTSIDE <sup>
    const allAnchors = Array.from(dom.querySelectorAll('a'));
    const paraAnchors = allAnchors.filter(a => !a.closest('sup'));

    paraAnchors.forEach(anchor => {
      const href = (anchor.getAttribute('href') || '').trim();
      const id = (anchor.getAttribute('id') || '').trim();
      const line = getAnchorLine(anchor);

      // Skip if no href and no id
      if (!href && !id) return;

      // Skip external URLs
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return;

      // TYPE 1 — Internal link: href="#something"
      if (href.startsWith('#')) {
        const target = href.slice(1);
        if (!allIds.has(target)) {
          issues.push({
            ruleId: 'anchor-link-check',
            severity: ruleCfg.severity,
            message: `Broken internal link — id="${target}" not found in this file`,
            detail: href,
            line: line,
            col: 0
          });
        }
      }

      // TYPE 2 & 3 — External link: href="file.xhtml" or "file.xhtml#anchor"
      else if (href) {
        const [filePart, anchorPart] = href.split('#');

        // Check file exists
        if (!fileMap || !fileMap.has(filePart)) {
          issues.push({
            ruleId: 'anchor-link-check',
            severity: ruleCfg.severity,
            message: `Broken external link — file "${filePart}" not found in project`,
            detail: href,
            line: line,
            col: 0
          });
        } else if (anchorPart) {
          // TYPE 3 — Check anchor exists in external file
          const externalParsed = fileMap.get(filePart);
          if (externalParsed && externalParsed.dom) {
            const targetEl = externalParsed.dom.getElementById(anchorPart);
            if (!targetEl) {
              issues.push({
                ruleId: 'anchor-link-check',
                severity: ruleCfg.severity,
                message: `Broken external anchor — id="${anchorPart}" not found in "${filePart}"`,
                detail: href,
                line: line,
                col: 0
              });
            }
          }
        }
      }

      // BACKLINK CHECK — id must have a matching href="#id" across all files
      if (id) {
        if (!allProjectHrefs.has(id)) {
          issues.push({
            ruleId: 'anchor-link-check',
            severity: ruleCfg.severity,
            message: `Orphan id="${id}" — no href="#${id}" found across project files`,
            detail: `id="${id}" in <a> has no backlink`,
            line: line,
            col: 0
          });
        }
      }
    });

    return issues;
  },

  'missing-images': function(parsed, ruleCfg, fileMap, allFiles) {
    const issues = [];
    const dom = parsed.dom;
    if (!dom) return issues;

    // Supported image formats
    const IMAGE_EXT = ['jpg', 'jpeg', 'png'];

    // Build a set of all file paths from allFiles
    // webkitRelativePath gives "folderName/images/ch6-fig-05.png"
    // Normalize to "images/ch6-fig-05.png" by stripping root folder
    const availablePaths = new Set();
    (allFiles || []).forEach(file => {
      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.split('/');
      if (parts.length > 1) {
        const normalized = parts.slice(1).join('/');
        availablePaths.add(normalized);
      } else {
        availablePaths.add(relPath);
      }
    });

    // Build line lookup for img elements
    const imgElements = parsed.elements.filter(el => el.tag === 'img');
    const imgLineMap = new Map();
    imgElements.forEach(el => {
      const src = (el.attrs.src || '').trim();
      if (src && !imgLineMap.has(src)) imgLineMap.set(src, el.line);
    });

    // Find all <img> tags
    const imgTags = Array.from(dom.querySelectorAll('img'));

    imgTags.forEach(img => {
      const src = (img.getAttribute('src') || '').trim();

      // Flag missing src
      if (!src) {
        issues.push({
          ruleId: 'missing-images',
          severity: ruleCfg.severity,
          message: '<img> tag has no src attribute',
          detail: img.outerHTML.replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 100),
          line: 0,
          col: 0
        });
        return;
      }

      // Skip external URLs
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) return;

      // Check extension is supported
      const ext = src.split('.').pop().toLowerCase();
      if (!IMAGE_EXT.includes(ext)) return;

      // Check if file exists in project
      if (!availablePaths.has(src)) {
        issues.push({
          ruleId: 'missing-images',
          severity: ruleCfg.severity,
          message: `Missing image — "${src}" not found in project folder`,
          detail: src,
          line: imgLineMap.get(src) || 0,
          col: 0
        });
      }
    });

    return issues;
  },

  'duplicate-id-check': function(parsed, ruleCfg, fileMap, allFiles, currentFileName) {
    const issues = [];
    const dom = parsed.dom;
    if (!dom) return issues;

    // Build global ID map from fileMap ONLY
    // fileMap already contains all files including current file
    // so no need to add parsed separately
    const globalIdMap = new Map();

    function collectIds(parsedDoc, fileName) {
      if (!parsedDoc || !parsedDoc.dom) return;
      const elements = parsedDoc.elements || [];
      elements.forEach(el => {
        const id = el.attrs && el.attrs.id;
        if (!id) return;

        // Skip pagebreak elements
        if (
          el.attrs.role === 'doc-pagebreak' ||
          el.attrs['epub:type'] === 'pagebreak'
        ) return;

        if (!globalIdMap.has(id)) globalIdMap.set(id, []);
        // Avoid adding the same file+line twice
        const existing = globalIdMap.get(id);
        const alreadyAdded = existing.some(o => o.file === fileName && o.line === (el.line || 0));
        if (!alreadyAdded) {
          existing.push({
            file: fileName,
            line: el.line || 0,
            tag: el.tag || ''
          });
        }
      });
    }

    // Collect from all files in fileMap (already includes current file)
    if (fileMap) {
      fileMap.forEach((fileParsed, fileName) => {
        collectIds(fileParsed, fileName);
      });
    }

    // Check current file's IDs for duplicates
    const currentElements = parsed.elements || [];
    const checkedIds = new Set();

    currentElements.forEach(el => {
      const id = el.attrs && el.attrs.id;
      if (!id) return;
      if (checkedIds.has(id)) return;
      checkedIds.add(id);

      const occurrences = globalIdMap.get(id) || [];
      if (occurrences.length > 1) {
        const locations = occurrences
          .map(o => `${o.file} (line ${o.line}, <${o.tag}>)`)
          .join(' | ');

        issues.push({
          ruleId: 'duplicate-id-check',
          severity: ruleCfg.severity,
          message: `Duplicate id="${id}" found in ${occurrences.length} places`,
          detail: locations,
          line: el.line || 0,
          col: 0
        });
      }
    });

    return issues;
  },

  'p-missing-class': function(parsed, ruleCfg) {
    const issues = [];
    const dom = parsed.dom;
    if (!dom) return issues;

    // Build line lookup for p elements
    const pElements = parsed.elements.filter(el => el.tag === 'p');
    let pIndex = 0;

    function getPLine() {
      const el = pElements[pIndex];
      pIndex++;
      return el ? el.line : 0;
    }

    // Get all <p> tags
    const allP = Array.from(dom.querySelectorAll('p'));

    allP.forEach(p => {
      const line = getPLine();

      // Skip <p> inside <blockquote>
      if (p.closest('blockquote')) return;

      const cls = p.getAttribute('class');

      // Flag if no class attribute or empty class
      if (cls === null || cls.trim() === '') {
        issues.push({
          ruleId: 'p-missing-class',
          severity: ruleCfg.severity,
          message: cls === null
            ? '<p> tag has no class attribute'
            : '<p> tag has an empty class attribute',
          detail: p.outerHTML.replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 100),
          line: line,
          col: 0
        });
      }
    });

    return issues;
  },

  'span-outside-li': function(parsed, ruleCfg) {
    const issues = [];
    const dom = parsed.dom;
    if (!dom) return issues;

    // Build line lookup for span elements
    const spanElements = parsed.elements.filter(el => el.tag === 'span');
    const spanLineMap = new Map();
    spanElements.forEach(el => {
      const key = JSON.stringify(el.attrs);
      if (!spanLineMap.has(key)) spanLineMap.set(key, el.line);
    });

    // Find all ul and ol elements
    const lists = Array.from(dom.querySelectorAll('ul, ol'));

    lists.forEach(list => {
      // Check direct children only
      Array.from(list.children).forEach(child => {
        if (child.tagName && child.tagName.toLowerCase() === 'span') {
          // This span is a direct child of ul/ol — invalid
          const outerHTML = child.outerHTML
            .replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '')
            .slice(0, 100);

          const attrKey = JSON.stringify(
            Array.from(child.attributes || []).reduce((acc, a) => {
              acc[a.name.toLowerCase()] = a.value;
              return acc;
            }, {})
          );

          issues.push({
            ruleId: 'span-outside-li',
            severity: ruleCfg.severity,
            message: `<span> is a direct child of <${list.tagName.toLowerCase()}> — must be inside a <li>`,
            detail: outerHTML,
            line: spanLineMap.get(attrKey) || 0,
            col: 0
          });
        }
      });
    });

    return issues;
  }
};

window.RULES['unlinked-reference'] = function(parsed) {
  const issues = [];
  const REFERENCE_RE = /(?<![A-Za-z])(Figure|Fig\.|Fig|Illustration|Illus\.|Ill\.|Chapter|Ch\.|Section|Sect\.|Sec\.|Appendix|App\.|Algorithm|Algo\.|Exercise|Equation|Eq\.|Footnote|Theorem|Thm\.|Listing|List\.|Problem|Prob\.|Example|Ex\.|Article|Art\.|Exhibit|Formula|Diagram|Sidebar|Annex|Amendment|Schedule|Clause|Specimen|Solution|Sample|Stanza|Scene|Verse|Volume|Vol\.|Plate|Pl\.|Table|Tab\.|Graph|Chart|Image|Scheme|Lemma|Proof|Answer|Panel|Part|Map|Box|Note|Act|Line|Case)(?![A-Za-z])[\s\-\.]*(\d[\d\.]*[A-Za-z]?)/gi;
  // Build a set of line indices that are inside <figcaption>...</figcaption>
  const skipLines = new Set();
  let inFigcaption = false;
  parsed.lines.forEach((line, i) => {
    if (/<figcaption[\s>]/i.test(line)) inFigcaption = true;
    if (inFigcaption) skipLines.add(i);
    if (/<\/figcaption>/i.test(line)) inFigcaption = false;
  });

  parsed.lines.forEach((line, i) => {
    // Skip figcaption blocks
    if (skipLines.has(i)) return;
    // Skip lines containing img or figure tags
    if (/<img\s|<figure[\s>]|<\/figure>/i.test(line)) return;

    REFERENCE_RE.lastIndex = 0;
    let match;
    while ((match = REFERENCE_RE.exec(line)) !== null) {
      const matchIndex = match.index;
      const before = line.slice(0, matchIndex);
      const openA = before.lastIndexOf('<a ');
      const closeA = before.lastIndexOf('</a>');
      if (openA !== -1 && openA > closeA) continue;
      issues.push({
        ruleId: 'unlinked-reference',
        line: i + 1,
        col: matchIndex + 1,
        length: match[0].length,
        message: `Cross-reference "${match[0].trim()}" is not wrapped in an anchor tag`,
        detail: `Found: ${match[0].trim()}`
      });
    }
  });
  return issues;
};
