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
    check: function (parsed, ruleCfg) {
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

    render: function (issue, fileName) {
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

  'sup-link-check': function (parsed, ruleCfg, fileMap) {
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

  'anchor-link-check': function (parsed, ruleCfg, fileMap, allFiles) {
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

  'missing-images': function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
    const issues = [];
    const dom = parsed.dom;
    if (!dom) return issues;

    // Supported image formats (expanded)
    const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

    // Build a set of all file paths from allFiles
    // webkitRelativePath gives "folderName/OEBPS/images/fig01.png"
    // Normalize by stripping the root folder prefix
    const availablePaths = new Set();
    (allFiles || []).forEach(file => {
      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.split('/');
      // Strip root folder (index 0), keep the rest: "OEBPS/images/fig01.png"
      const normalized = parts.length > 1 ? parts.slice(1).join('/') : relPath;
      availablePaths.add(normalized.toLowerCase());
    });

    // Find the current XHTML file's folder path (relative to root folder)
    // e.g. allFiles entry: "BookFolder/OEBPS/xhtml/ch01.xhtml" → folder = "OEBPS/xhtml"
    let currentFileFolder = '';
    if (currentFileName) {
      const match = Array.from(allFiles || []).find(f =>
        (f.webkitRelativePath || f.name).endsWith('/' + currentFileName) ||
        (f.webkitRelativePath || f.name) === currentFileName
      );
      if (match) {
        const relPath = match.webkitRelativePath || match.name;
        const parts = relPath.split('/');
        // Strip root folder, keep folder up to file: "OEBPS/xhtml"
        if (parts.length > 2) {
          currentFileFolder = parts.slice(1, -1).join('/');
        }
      }
    }

    // Resolve a src path relative to the current file's folder
    function resolveSrc(src) {
      if (!currentFileFolder) return src.toLowerCase();
      // Split folder into segments and apply src navigation
      const folderParts = currentFileFolder.split('/');
      const srcParts = src.split('/');
      const resolved = [...folderParts];
      srcParts.forEach(part => {
        if (part === '..') resolved.pop();
        else if (part !== '.') resolved.push(part);
      });
      return resolved.join('/').toLowerCase();
    }

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

      // Skip external URLs and data URIs
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//') || src.startsWith('data:')) return;

      // Check extension is supported
      const ext = src.split('.').pop().split('?')[0].toLowerCase();
      if (!IMAGE_EXT.includes(ext)) return;

      // Resolve relative path and check against available files
      const resolved = resolveSrc(src);
      if (!availablePaths.has(resolved)) {
        issues.push({
          ruleId: 'missing-images',
          severity: ruleCfg.severity,
          message: `Missing image — "${src}" not found in project folder`,
          detail: `Resolved path: ${resolved}`,
          line: imgLineMap.get(src) || 0,
          col: 0
        });
      }
    });

    return issues;
  },

  'duplicate-id-check': function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
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

  'p-missing-class': function (parsed, ruleCfg) {
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

  'span-outside-li': function (parsed, ruleCfg) {
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

window.RULES['unlinked-reference'] = function (parsed) {
  const issues = [];
  const REFERENCE_RE = /(?<![A-Za-z])(Figure|Fig\.|Table|Tab\.|Chapter|Subsection|Section|Sect\.|Appendix|Equation|Eq\.|Exercise|Example)(?![A-Za-z])[\s\-\.]*([\d][\d\.]*[A-Za-z]?)/gi;
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
    REFERENCE_RE.lastIndex = 0;
    let match;
    while ((match = REFERENCE_RE.exec(line)) !== null) {
      const matchIndex = match.index;
      const before = line.slice(0, matchIndex);

      // Skip if inside a tag attribute (between < and >)
      const lastOpen = before.lastIndexOf('<');
      const lastClose = before.lastIndexOf('>');
      if (lastOpen !== -1 && lastOpen > lastClose) continue;

      // Skip if already inside an <a> tag
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

window.RULES['raw-url'] = function(parsed, ruleCfg) {
  const issues = [];
  const URL_RE = /(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s<>"']+/gi;

  parsed.lines.forEach((line, i) => {
    URL_RE.lastIndex = 0;
    let match;
    while ((match = URL_RE.exec(line)) !== null) {
      const before = line.slice(0, match.index);

      // Skip if inside a tag attribute (between < and >)
      const lastOpen = before.lastIndexOf('<');
      const lastClose = before.lastIndexOf('>');
      if (lastOpen !== -1 && lastOpen > lastClose) continue;

      // Skip if already inside an <a> tag
      const openA = before.lastIndexOf('<a ');
      const closeA = before.lastIndexOf('</a>');
      if (openA !== -1 && openA > closeA) continue;

      issues.push({
        ruleId: 'raw-url',
        severity: ruleCfg.severity,
        line: i + 1,
        col: match.index + 1,
        message: `Raw URL in text: "${match[0].slice(0, 60)}" is not wrapped in an <a> tag`,
        detail: match[0]
      });
    }
  });

  return issues;
};

window.RULES['bm-unlinked-range-number'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];

  // Only run on _bm* files
  if (!currentFileName || !/_bm[^/]*\.xhtml$/i.test(currentFileName)) return issues;

  const DASH_ENTITIES = /(?:&#x2013;|&#x2014;|&ndash;|&mdash;|-)/g;

  parsed.lines.forEach((line, i) => {
    DASH_ENTITIES.lastIndex = 0;
    let match;
    while ((match = DASH_ENTITIES.exec(line)) !== null) {
      const matchIndex = match.index;

      // Skip if inside any HTML/XML tag (between < and >)
      const before = line.slice(0, matchIndex);
      const lastOpen = before.lastIndexOf('<');
      const lastClose = before.lastIndexOf('>');
      if (lastOpen !== -1 && lastOpen > lastClose) continue;

      const afterDash = line.slice(matchIndex + match[0].length).trimStart();
      const numMatch = afterDash.match(/^(\d+)/);
      if (!numMatch) continue;

      const isLinked = /^<a[\s>]/.test(afterDash);
      if (!isLinked) {
        issues.push({
          ruleId: 'bm-unlinked-range-number',
          severity: ruleCfg.severity,
          line: i + 1,
          col: matchIndex + match[0].length + 1,
          message: `Range number "${numMatch[1]}" after dash is not wrapped in an <a> tag`,
          detail: `In file: ${currentFileName}`
        });
      }
    }
  });

  return issues;
};

window.RULES['pagebreak-check'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];
  const pageData = window.PAGE_DATA;

  // Surface Excel errors as issues
  if (!pageData) {
    issues.push({
      ruleId: 'pagebreak-check',
      severity: 'error',
      line: 0, col: 0,
      message: 'No Excel file found in project folder',
      detail: 'Place the Excel file alongside your XHTML files'
    });
    return issues;
  }

  if (pageData.error) {
    issues.push({
      ruleId: 'pagebreak-check',
      severity: 'error',
      line: 0, col: 0,
      message: pageData.error,
      detail: 'Fix the Excel file format and revalidate'
    });
    return issues;
  }

  if (!pageData.files) return issues;

  const fileEntry = pageData.files.find(f => f.filename === currentFileName);
  if (!fileEntry) return issues;
  if (fileEntry.flag === 1) return issues;

  const expectedPages = [];
  const start = fileEntry.startPage;
  const end = fileEntry.endPage;
  const type = fileEntry.type;

  function toRoman(num) {
    const val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
    let result = '';
    for (let i = 0; i < val.length; i++) {
      while (num >= val[i]) { result += syms[i]; num -= val[i]; }
    }
    return result;
  }

  for (let p = start; p <= end; p++) {
    expectedPages.push(type === 'roman' ? toRoman(p) : String(p));
  }

  // Collect actual pagebreaks from parsed elements
  const foundPages = new Set();
  parsed.elements.forEach(el => {
    if (el.tag === 'span' && el.attrs['epub:type'] === 'pagebreak') {
      const label = el.attrs['aria-label'] || '';
      if (label) foundPages.add(label.trim().toLowerCase());
    }
  });

  // Check missing pagebreaks
  expectedPages.forEach(page => {
    if (!foundPages.has(page.toLowerCase())) {
      issues.push({
        ruleId: 'pagebreak-check',
        severity: ruleCfg.severity,
        line: 0,
        col: 0,
        message: `Missing pagebreak: page "${page}" not found in file`,
        detail: `Expected pages ${start} to ${end} (${type})`
      });
    }
  });

  return issues;
};

window.RULES['pagebreak-wrong-file'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];
  const allSpans = parsed.elements.filter(el => el.tag === 'span');
  console.log('[wrong-file] spans in', currentFileName, allSpans.map(el => JSON.stringify(el.attrs)));
  const pageData = window.PAGE_DATA;

  if (!pageData || pageData.error || !pageData.files) return issues;

  const fileEntry = pageData.files.find(f => f.filename === currentFileName);
  if (!fileEntry) return issues;
  if (fileEntry.flag === 1) return issues;

  function toRoman(num) {
    const val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
    let result = '';
    for (let i = 0; i < val.length; i++) {
      while (num >= val[i]) { result += syms[i]; num -= val[i]; }
    }
    return result;
  }

  // Build expected page labels for this file
  const expectedLabels = new Set();
  for (let p = fileEntry.startPage; p <= fileEntry.endPage; p++) {
    expectedLabels.add(fileEntry.type === 'roman' ? toRoman(p) : String(p));
  }

  // Check each pagebreak found in this file
  parsed.elements.forEach(el => {
    if (el.tag !== 'span' || el.attrs['epub:type'] !== 'pagebreak') return;
    const label = (el.attrs['aria-label'] || '').trim().toLowerCase();
    if (!label) return;
    if (expectedLabels.has(label)) return;

    // Find which file it belongs to
    let belongsTo = null;
    for (const f of pageData.files) {
      for (let p = f.startPage; p <= f.endPage; p++) {
        const expected = f.type === 'roman' ? toRoman(p) : String(p);
        if (expected === label) { belongsTo = f; break; }
      }
      if (belongsTo) break;
    }

    const detail = belongsTo
      ? `page_${label} belongs to ${belongsTo.filename} (pages ${belongsTo.startPage}–${belongsTo.endPage})`
      : `page_${label} does not belong to any file in the Excel`;

    issues.push({
      ruleId: 'pagebreak-wrong-file',
      severity: ruleCfg.severity,
      line: el.line,
      col: el.col,
      message: `Pagebreak "page_${label}" found in wrong file`,
      detail
    });
  });

  return issues;
};

window.RULES['pagebreak-sequence'] = {
  check: function(parsed, ruleCfg, fileMap, allFiles, currentFileName) {
    const issues = [];
    const pageData = window.PAGE_DATA;

    if (!pageData || pageData.error || !pageData.files) return issues;

    const fileEntry = pageData.files.find(f => f.filename === currentFileName);
    if (!fileEntry) return issues;
    if (fileEntry.flag === 1) return issues;

    function romanToNum(str) {
      const map = { i:1, v:5, x:10, l:50, c:100, d:500, m:1000 };
      let result = 0;
      const s = str.toLowerCase();
      for (let i = 0; i < s.length; i++) {
        const curr = map[s[i]];
        const next = map[s[i+1]];
        if (!curr) return null;
        result += next && next > curr ? -curr : curr;
      }
      return result;
    }

    // Collect pagebreaks in document order
    const pagebreaks = [];
    parsed.elements.forEach(el => {
      if (el.tag !== 'span' || el.attrs['epub:type'] !== 'pagebreak') return;
      const label = (el.attrs['aria-label'] || '').trim().toLowerCase();
      if (!label) return;
      let num = fileEntry.type === 'roman' ? romanToNum(label) : parseInt(label, 10);
      if (isNaN(num)) num = null;
      pagebreaks.push({ label, num, line: el.line, col: el.col });
    });

    // Check sequence order
    for (let i = 1; i < pagebreaks.length; i++) {
      const prev = pagebreaks[i - 1];
      const curr = pagebreaks[i];
      if (prev.num === null || curr.num === null) continue;
      if (curr.num <= prev.num) {
        issues.push({
          ruleId: 'pagebreak-sequence',
          severity: ruleCfg.severity,
          line: curr.line,
          col: curr.col,
          message: `Pagebreak "page_${curr.label}" is out of order (found after "page_${prev.label}")`,
          detail: `Expected pagebreaks to be in ascending order`,
          _custom: {
            pagebreaks,
            badIndex: i
          }
        });
      }
    }

    // Add one synthetic issue to trigger the timeline render even if only one problem
    if (issues.length > 0) {
      // Attach full pagebreaks to first issue only for timeline rendering
      issues[0]._custom = { pagebreaks, badIndices: issues.map(iss => iss._custom?.badIndex).filter(x => x !== undefined) };
      // Remove _custom from rest to avoid duplicate timelines
      for (let i = 1; i < issues.length; i++) delete issues[i]._custom;
    }

    return issues;
  },

  render: function(issue, fileName) {
    if (!issue._custom) return null;
    const { pagebreaks, badIndices } = issue._custom;
    const badSet = new Set(badIndices);

    const wrap = document.createElement('div');
    wrap.className = 'pb-timeline-wrap';

    const label = document.createElement('div');
    label.className = 'pb-timeline-label';
    label.textContent = 'Pagebreak Sequence';
    wrap.appendChild(label);

    const track = document.createElement('div');
    track.className = 'pb-timeline-track';

    pagebreaks.forEach((pb, idx) => {
      // Node
      const node = document.createElement('div');
      node.className = 'pb-node' + (badSet.has(idx) ? ' pb-node-error' : ' pb-node-ok');

      const dot = document.createElement('div');
      dot.className = 'pb-dot';

      const lbl = document.createElement('div');
      lbl.className = 'pb-node-label';
      lbl.textContent = pb.label;

      if (pb.line) {
        const lineLbl = document.createElement('div');
        lineLbl.className = 'pb-node-line';
        lineLbl.textContent = 'L' + pb.line;
        node.appendChild(dot);
        node.appendChild(lbl);
        node.appendChild(lineLbl);
      } else {
        node.appendChild(dot);
        node.appendChild(lbl);
      }

      track.appendChild(node);

      // Connector arrow between nodes
      if (idx < pagebreaks.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'pb-arrow' + (badSet.has(idx + 1) ? ' pb-arrow-error' : '');
        arrow.innerHTML = '→';
        track.appendChild(arrow);
      }
    });

    wrap.appendChild(track);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'pb-legend';
    legend.innerHTML = `
      <span class="pb-legend-item"><span class="pb-dot pb-dot-ok"></span> In order</span>
      <span class="pb-legend-item"><span class="pb-dot pb-dot-error"></span> Out of order</span>
    `;
    wrap.appendChild(legend);

    return wrap;
  }
};

window.RULES['pagebreak-duplicate'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];

  // Build a map of aria-label -> [filenames] across all files
  if (!window._pagebreakLabelMap) {
    window._pagebreakLabelMap = {};
    fileMap.forEach((fileParsed, fileName) => {
      if (!fileName.endsWith('.xhtml')) return;
      fileParsed.elements.forEach(el => {
        if (el.tag !== 'span' || el.attrs['epub:type'] !== 'pagebreak') return;
        const label = (el.attrs['aria-label'] || '').trim().toLowerCase();
        if (!label) return;
        if (!window._pagebreakLabelMap[label]) window._pagebreakLabelMap[label] = [];
        window._pagebreakLabelMap[label].push(fileName);
      });
    });
  }

  // Check current file's pagebreaks against the map
  parsed.elements.forEach(el => {
    if (el.tag !== 'span' || el.attrs['epub:type'] !== 'pagebreak') return;
    const label = (el.attrs['aria-label'] || '').trim().toLowerCase();
    if (!label) return;

    const filesWithLabel = window._pagebreakLabelMap[label] || [];
    if (filesWithLabel.length <= 1) return;

    const otherFiles = filesWithLabel.filter(f => f !== currentFileName);
    if (!otherFiles.length) return;

    issues.push({
      ruleId: 'pagebreak-duplicate',
      severity: ruleCfg.severity,
      line: el.line,
      col: el.col,
      message: `Duplicate pagebreak "page_${label}" also found in: ${otherFiles.join(', ')}`,
      detail: `Pagebreak aria-label="${label}" appears in ${filesWithLabel.length} files`
    });
  });

  return issues;
};

window.RULES['epub-type-id-link-check'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];
  const dom = parsed.dom;
  if (!dom) return issues;

  const TARGET_TYPES = ['footnote', 'biblioentry'];

  // 1. Find all elements with epub:type="footnote" or epub:type="biblioentry"
  //    epub:type may be serialized as "epub:type" attribute in DOMParser output
  const allElements = Array.from(dom.querySelectorAll('*'));
  const targets = allElements.filter(el => {
    const epubType = el.getAttribute('epub:type') || el.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '';
    return TARGET_TYPES.includes(epubType.trim().toLowerCase());
  });

  if (!targets.length) return issues;

  // 2. Extract id from each target:
  //    Shape 1: id on the element itself
  //    Shape 2: id on first child <span class="reflabel">
  const targetIds = []; // [{ id, line }]
  const parsedEls = parsed.elements;

  targets.forEach((el, idx) => {
    let id = el.getAttribute('id') || '';
    let idLine = 0;

    if (!id) {
      // Check first child span with class="reflabel"
      const span = el.querySelector('span.reflabel, span[class="reflabel"]');
      if (span) {
        id = span.getAttribute('id') || '';
      }
    }

    if (!id) return; // no id found — skip (different rule's concern)

    // Get line number from parsed.elements by matching tag + id
    const matchEl = parsedEls.find(e =>
      (e.attrs && e.attrs.id === id)
    );
    idLine = matchEl ? matchEl.line : 0;

    targetIds.push({ id, line: idLine });
  });

  if (!targetIds.length) return issues;

  // 3. Build a set of all href fragment references across ALL xhtml files
  //    fileMap keys are filenames; values are raw text strings
  const allHrefs = new Set();
  const allFilesList = Array.isArray(allFiles) ? allFiles : Array.from((allFiles || new Map()).values());

  allFilesList.forEach(f => {
    if (!f.name.endsWith('.xhtml')) return;
    const text = fileMap.get(f.name) || '';
    // Match href="#id" or href="file.xhtml#id" — capture the fragment part
    const hrefRe = /href="[^"]*#([^"]+)"/g;
    let m;
    while ((m = hrefRe.exec(text)) !== null) {
      allHrefs.add(m[1]);
    }
  });

  // 4. Check each target id against allHrefs
  targetIds.forEach(({ id, line }) => {
    if (!allHrefs.has(id)) {
      issues.push({
        ruleId: 'epub-type-id-link-check',
        severity: ruleCfg.severity || 'warn',
        message: `epub:type element id "${id}" is not referenced by any anchor tag across all files`,
        detail: `id="${id}" — no <a href="#${id}"> or <a href="file.xhtml#${id}"> found in any XHTML file`,
        line,
        col: 0
      });
    }
  });

  return issues;
};

window.RULES['stylesheet-class-check'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];
  const dom = parsed.dom;
  if (!dom) return issues;

  // 1. Find the CSS file from allFiles (first .css file inside OEBPS/)
  const allFilesList = Array.isArray(allFiles) ? allFiles : Array.from((allFiles || new Map()).values());
  const cssFile = allFilesList.find(f => {
    const p = (f.webkitRelativePath || f.name || '').toLowerCase();
    return p.includes('oebps') && f.name.endsWith('.css');
  });

  if (!cssFile) {
    return [{
      ruleId: 'stylesheet-class-check',
      severity: 'warn',
      message: 'No CSS file found in OEBPS folder — cannot check classes',
      detail: '',
      line: 0,
      col: 0
    }];
  }

  // 2. Read CSS text from fileMap
  const cssEntry = fileMap.get(cssFile.name);
  const cssText = cssEntry ? cssEntry : '';

  if (!cssText) {
    return [{
      ruleId: 'stylesheet-class-check',
      severity: 'warn',
      message: 'CSS file found but could not be read: ' + cssFile.name,
      detail: '',
      line: 0,
      col: 0
    }];
  }

  // 3. Extract all defined class names from CSS text
  // Matches .classname in selectors — handles compound, element+class, pseudo etc.
  const definedClasses = new Set();
  const cssClassRe = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  let cm;
  while ((cm = cssClassRe.exec(cssText)) !== null) {
    definedClasses.add(cm[1]);
  }

  if (!definedClasses.size) {
    return [{
      ruleId: 'stylesheet-class-check',
      severity: 'warn',
      message: 'CSS file has no class definitions: ' + cssFile.name,
      detail: '',
      line: 0,
      col: 0
    }];
  }

  // 4. Walk all elements in XHTML and check their classes
  const allEls = Array.from(dom.querySelectorAll('[class]'));
  const reported = new Set(); // avoid duplicate reports per class name

  allEls.forEach((el, idx) => {
    const classAttr = (el.getAttribute('class') || '').trim();
    if (!classAttr) return;
    if ((el.tagName || '').toLowerCase() === 'section') return;

    const classes = classAttr.split(/\s+/).filter(Boolean);
    const matchEl = parsed.elements[idx];

    classes.forEach(cls => {
      if (reported.has(cls)) return;
      if (!definedClasses.has(cls)) {
        reported.add(cls);
        issues.push({
          ruleId: 'stylesheet-class-check',
          severity: ruleCfg.severity || 'warn',
          message: `Class "${cls}" used in XHTML but not defined in CSS`,
          detail: (el.outerHTML || '').replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 120),
          line: matchEl ? matchEl.line : 0,
          col: matchEl ? matchEl.col : 0
        });
      }
    });
  });

  return issues;
};

window.RULES['xref-text-match'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];
  const dom = parsed.dom;
  if (!dom) return issues;

  // --- Normalize text for comparison ---
  function normalizeText(str) {
    return str
      .trim()
      // Full words first — Figure/Figures (strip trailing dot if any)
      .replace(/\bFigures?\.?(?=\s|$)/g, 'Figure')
      .replace(/\bTables?\.?(?=\s|$)/g, 'Table')
      // Abbreviations — must NOT be followed by "ure" or "able"
      .replace(/\bFigs?\.?(?!ure)(?=\s|$|\d)/g, 'Figure')
      .replace(/\bTabs?\.?(?!le)(?=\s|$|\d)/g, 'Table')
      .replace(/\.\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // --- Build labelMap from all xhtml files via fileMap (stores ParsedDoc) ---
  // Key: id, Value: { text, fileName }
  const labelMap = new Map();
  const allFilesList = Array.isArray(allFiles)
    ? allFiles
    : Array.from((allFiles || new Map()).values());

  allFilesList.forEach(f => {
    if (!f.name.endsWith('.xhtml')) return;
    const parsedDoc = fileMap.get(f.name);
    if (!parsedDoc || !parsedDoc.dom) return;

    // Find all span.label with an id in this file's DOM
    const spans = Array.from(parsedDoc.dom.querySelectorAll('span.label[id], span[class="label"][id]'));
    spans.forEach(span => {
      const id = span.getAttribute('id');
      if (!id) return;
      const labelText = normalizeText(span.textContent || '');
      if (labelText) labelMap.set(id, { text: labelText, fileName: f.name });
    });
  });

  // Also scan current file's own DOM (current file may not be in fileMap yet)
  const currentSpans = Array.from(dom.querySelectorAll('span.label[id], span[class="label"][id]'));
  currentSpans.forEach(span => {
    const id = span.getAttribute('id');
    if (!id) return;
    const labelText = normalizeText(span.textContent || '');
    if (labelText && !labelMap.has(id)) {
      labelMap.set(id, { text: labelText, fileName: currentFileName });
    }
  });

  // --- Find all <a class="xref" href="#..."> in current file ---
  const xrefAnchors = Array.from(dom.querySelectorAll('a.xref[href], a[class="xref"][href]'));
  const parsedEls = parsed.elements;

  xrefAnchors.forEach(anchor => {
    const href = anchor.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    const targetId = href.slice(1);
    if (!targetId) return;

    const anchorRaw = (anchor.textContent || '').trim();
    if (!anchorRaw) return;

    const anchorNorm = normalizeText(anchorRaw);
    const labelEntry = labelMap.get(targetId);

    // id not found — skip (anchor-link-check covers missing ids)
    if (!labelEntry) return;

    const labelNorm = labelEntry.text;

    // Multi-ref: "Figures 4.1 and 4.2" — check label appears inside anchor
    const isMultiRef = /\band\b/i.test(anchorNorm);
    const matched = isMultiRef
      ? anchorNorm.includes(labelNorm)
      : anchorNorm === labelNorm;

    if (!matched) {
      const matchEl = parsedEls.find(e =>
        e.tag === 'a' &&
        e.attrs &&
        e.attrs.href === href &&
        (e.attrs.class || '').includes('xref')
      );

      issues.push({
        ruleId: 'xref-text-match',
        severity: ruleCfg.severity || 'error',
        message: `Xref text mismatch: anchor says "${anchorRaw}" but label says "${labelEntry.text}"`,
        detail: `href="${href}" in ${currentFileName} → label in ${labelEntry.fileName}`,
        line: matchEl ? matchEl.line : 0,
        col: matchEl ? matchEl.col : 0
      });
    }
  });

  return issues;
};

window.RULES['caption-label-unreferenced'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];
  const dom = parsed.dom;
  if (!dom) return issues;

  // 1. Build set of all xref href fragments across ALL xhtml files
  const allXrefIds = new Set();
  const allFilesList = Array.isArray(allFiles)
    ? allFiles
    : Array.from((allFiles || new Map()).values());

  allFilesList.forEach(f => {
    if (!f.name.endsWith('.xhtml')) return;
    const parsedDoc = fileMap.get(f.name);
    if (!parsedDoc || !parsedDoc.dom) return;

    // Collect all <a class="xref" href="#..."> fragments
    const anchors = Array.from(parsedDoc.dom.querySelectorAll('a.xref[href], a[class="xref"][href]'));
    anchors.forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#')) allXrefIds.add(href.slice(1));
    });
  });

  // Also collect from current file's own DOM
  const currentAnchors = Array.from(dom.querySelectorAll('a.xref[href], a[class="xref"][href]'));
  currentAnchors.forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) allXrefIds.add(href.slice(1));
  });

  // 2. Find all span.label inside figcaption or p.tblcaption in current file
  const candidateSpans = [];

  // Shape 1: span.label inside <figcaption>
  const figcaptions = Array.from(dom.querySelectorAll('figcaption'));
  figcaptions.forEach(fc => {
    const spans = Array.from(fc.querySelectorAll('span.label[id], span[class="label"][id]'));
    spans.forEach(s => candidateSpans.push(s));
  });

  // Shape 2: span.label inside <p class="tblcaption"> or <p class="figcaption">
  const captionPs = Array.from(dom.querySelectorAll('p.tblcaption, p.figcaption, p[class="tblcaption"], p[class="figcaption"]'));
  captionPs.forEach(p => {
    const spans = Array.from(p.querySelectorAll('span.label[id], span[class="label"][id]'));
    spans.forEach(s => {
      // Avoid duplicates (figcaption already covered above)
      if (!candidateSpans.includes(s)) candidateSpans.push(s);
    });
  });

  // 3. Check each candidate span
  const LABEL_RE = /\b(Figure|Figures|Fig|Figs|Table|Tables|Tab|Tabs)\b/i;
  const parsedEls = parsed.elements;

  candidateSpans.forEach(span => {
    const id = span.getAttribute('id');
    if (!id) return;

    const text = (span.textContent || '').trim();

    // Only check spans whose text contains Figure or Table variants
    if (!LABEL_RE.test(text)) return;

    if (!allXrefIds.has(id)) {
      // Get line number
      const matchEl = parsedEls.find(e =>
        e.attrs && e.attrs.id === id && e.tag === 'span'
      );

      issues.push({
        ruleId: 'caption-label-unreferenced',
        severity: ruleCfg.severity || 'error',
        message: `Caption label "${text.slice(0, 40)}" (id="${id}") has no <a class="xref"> pointing to it`,
        detail: `id="${id}" — no <a class="xref" href="#${id}"> found in any XHTML file`,
        line: matchEl ? matchEl.line : 0,
        col: matchEl ? matchEl.col : 0
      });
    }
  });

  return issues;
};

window.RULES['figure-missing-label'] = function (parsed, ruleCfg) {
  const issues = [];
  const dom = parsed.dom;
  if (!dom) return issues;

  const LABEL_RE = /\b(Figure|Figures|Fig|Figs|Table|Tables|Tab|Tabs)\b/i;
  const parsedEls = parsed.elements;

  // Find all <figure> elements
  const figures = Array.from(dom.querySelectorAll('figure'));

  figures.forEach(figure => {
    // Skip cover images
    const imgs = Array.from(figure.querySelectorAll('img'));
    const isCover = imgs.some(img =>
      (img.getAttribute('epub:type') || '') === 'cover' ||
      (img.getAttribute('role') || '') === 'doc-cover' ||
      (img.getAttribute('alt') || '').toLowerCase().includes('cover')
    );
    if (isCover) return;

    // Skip non-content figures (logos, decorative, publisher marks etc.)
    // Only process figures with no class OR class contains 'Table'
    // Skip known non-content classes: publogo, logo, decoration, ornament, etc.
    const figClass = (figure.getAttribute('class') || '').toLowerCase();
    const SKIP_CLASSES = ['publogo', 'logo', 'decoration', 'ornament', 'publisher', 'emblem', 'seal', 'icon'];
    if (SKIP_CLASSES.some(c => figClass.includes(c))) return;

    // 1. Check figcaption exists
    const figcaption = figure.querySelector('figcaption');
    if (!figcaption) {
      const matchEl = parsedEls.find(e =>
        e.tag === 'figure' &&
        e.attrs &&
        JSON.stringify(e.attrs) === JSON.stringify(
          Object.fromEntries(
            Array.from(figure.attributes || []).map(a => [a.name.toLowerCase(), a.value])
          )
        )
      );
      issues.push({
        ruleId: 'figure-missing-label',
        severity: ruleCfg.severity || 'error',
        message: '<figure> is missing a <figcaption> entirely',
        detail: (figure.outerHTML || '').replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 120),
        line: matchEl ? matchEl.line : 0,
        col: matchEl ? matchEl.col : 0
      });
      return;
    }

    // 2. Check span.label exists inside figcaption
    const labelSpan = figcaption.querySelector('span.label, span[class="label"]');
    if (!labelSpan) {
      const matchEl = parsedEls.find(e =>
        e.tag === 'figcaption'
      );
      issues.push({
        ruleId: 'figure-missing-label',
        severity: ruleCfg.severity || 'error',
        message: '<figcaption> is missing a <span class="label"> inside it',
        detail: (figcaption.outerHTML || '').replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 120),
        line: matchEl ? matchEl.line : 0,
        col: matchEl ? matchEl.col : 0
      });
      return;
    }

    // 3. Check span.label text contains Figure or Table variant
    const labelText = (labelSpan.textContent || '').trim();
    if (!LABEL_RE.test(labelText)) {
      const matchEl = parsedEls.find(e =>
        e.tag === 'span' &&
        e.attrs &&
        (e.attrs.class || '').includes('label') &&
        e.attrs.id === labelSpan.getAttribute('id')
      );
      issues.push({
        ruleId: 'figure-missing-label',
        severity: ruleCfg.severity || 'error',
        message: `<span class="label"> text "${labelText.slice(0, 40)}" does not contain Figure or Table`,
        detail: (labelSpan.outerHTML || '').replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 120),
        line: matchEl ? matchEl.line : 0,
        col: matchEl ? matchEl.col : 0
      });
    }
  });

  return issues;
};


window.RULES['figure-caption-sequence'] = function (parsed, ruleCfg) {
  const issues = [];
  const dom = parsed.dom;
  if (!dom) return issues;

  const LABEL_RE = /\b(Figure|Figures|Fig|Table|Tables|Tab)\s+([\d.A-Z]+)/gi;

  function normalizeText(t) {
    return (t || '').toLowerCase().replace(/[.\s,;]+/g, ' ').trim();
  }

  function extractRefs(pEl) {
    const refs = [];
    // ONLY check <a class="xref"> tags — never raw paragraph text
    const xrefs = Array.from(pEl.querySelectorAll('a.xref[href], a[class="xref"][href]'));
    xrefs.forEach(a => {
      const text = (a.textContent || '').trim();
      const href = (a.getAttribute('href') || '');
      const id = href.startsWith('#') ? href.slice(1) : '';
      // Must match Figure/Table followed by a number
      const match = text.match(/\b(Figure|Figures|Fig|Table|Tables|Tab)\s+([\d.]+)/i);
      if (match && id) refs.push({ text: match[0].trim(), id });
    });
    return refs;
  }

  function getFigureLabel(figEl) {
    const span = figEl.querySelector('span.label, span[class="label"]');
    if (!span) return { text: '', id: '' };
    return {
      text: (span.textContent || '').trim(),
      id: (span.getAttribute('id') || '').trim()
    };
  }

  function isMatch(ref, label) {
    if (!label.text && !label.id) return false;
    if (label.text && normalizeText(label.text).startsWith(normalizeText(ref.text))) return true;
    if (ref.id && label.id && ref.id === label.id) return true;
    return false;
  }

  // Build a map from outerHTML prefix -> line number using parsed.elements
  // since parser assigns line numbers in DOM order
  const elLineMap = new Map();
  parsed.elements.forEach(e => {
    const key = e.tag + '|' + (e.attrs.id || '') + '|' + (e.attrs.class || '') + '|' + e.textContent.slice(0, 40);
    if (!elLineMap.has(key)) elLineMap.set(key, e.line);
  });

  function getLine(el) {
    const tag = (el.tagName || '').toLowerCase();
    const id = el.getAttribute('id') || '';
    const cls = el.getAttribute('class') || '';
    const text = (el.textContent || '').trim().slice(0, 40);
    const key = tag + '|' + id + '|' + cls + '|' + text;
    return elLineMap.get(key) || 0;
  }

  function processContainer(container) {
    const children = Array.from(container.children);

    children.forEach((child, idx) => {
      const tag = (child.tagName || '').toLowerCase();
      if (tag !== 'p') return;

      const refs = extractRefs(child);
      if (refs.length === 0) return;

      const nextSiblings = children.slice(idx + 1, idx + 1 + refs.length);

      refs.forEach((ref, i) => {
        const sibling = nextSiblings[i];

        if (!sibling) {
          issues.push({
            ruleId: 'figure-caption-sequence',
            severity: ruleCfg.severity || 'error',
            message: `No figure found after the reference "${ref.text}"`,
            detail: `The paragraph references "${ref.text}" but there is no figure after it`,
            line: getLine(child),
            col: 0
          });
          return;
        }

        const sibTag = (sibling.tagName || '').toLowerCase();

        if (sibTag !== 'figure') {
          issues.push({
            ruleId: 'figure-caption-sequence',
            severity: ruleCfg.severity || 'error',
            message: `The paragraph references "${ref.text}" but the next element is not a figure`,
            detail: `Something else appears between the "${ref.text}" reference and its figure`,
            line: getLine(child),
            col: 0
          });
          return;
        }

        const label = getFigureLabel(sibling);
        if (!label.text && !label.id) {
          issues.push({
            ruleId: 'figure-caption-sequence',
            severity: ruleCfg.severity || 'error',
            message: `The figure after "${ref.text}" has no label inside it`,
            detail: `Add a <span class="label"> with the figure or table number inside the figcaption`,
            line: getLine(sibling),
            col: 0
          });
          return;
        }

        if (!isMatch(ref, label)) {
          issues.push({
            ruleId: 'figure-caption-sequence',
            severity: ruleCfg.severity || 'error',
            message: `Reference says "${ref.text}" but the figure label says "${label.text || label.id}"`,
            detail: `The reference and the figure label do not match — please check the numbering`,
            line: getLine(sibling),
            col: 0
          });
        }
      });
    });

    children.forEach(child => {
      const tag = (child.tagName || '').toLowerCase();
      if (['section', 'div', 'article', 'main'].includes(tag)) {
        processContainer(child);
      }
    });
  }

  const body = dom.querySelector('body') || dom.documentElement;
  processContainer(body);

  return issues;
};

window.RULES['spix-log-check'] = function (parsed, ruleCfg, fileMap, allFiles) {
  const issues = [];

  const logText = fileMap.get('__spix.log__');

  if (!logText) {
    const isEpubMode = Array.from(allFiles || []).every(f =>
      (f.webkitRelativePath || '').indexOf('/') === -1
    );
    issues.push({
      ruleId: 'spix-log-check',
      severity: 'warn',
      message: isEpubMode
        ? 'Log file check is only available when selecting a project folder'
        : 'No Spix log file found in the project folder',
      detail: isEpubMode
        ? 'Please use the folder selection method to enable Spix log checking'
        : 'Make sure the .log file is in the same root folder as mimetype, META-INF and OEBPS',
      line: 0,
      col: 0
    });
    return issues;
  }

  const errorMatch     = logText.match(/#Total Error count\s*:\s*(\d+)/i);
  const warningMatch   = logText.match(/#Total Warning count\s*:\s*(\d+)/i);
  const exceptionMatch = logText.match(/#Total Exception count\s*:\s*(\d+)/i);

  const errorCount     = errorMatch     ? parseInt(errorMatch[1], 10)     : null;
  const warningCount   = warningMatch   ? parseInt(warningMatch[1], 10)   : null;
  const exceptionCount = exceptionMatch ? parseInt(exceptionMatch[1], 10) : null;

  if (errorCount === null && warningCount === null && exceptionCount === null) {
    issues.push({
      ruleId: 'spix-log-check',
      severity: 'warn',
      message: 'Could not read the Spix log file — format may be different',
      detail: 'Expected lines like "#Total Error count: 0" in the log file',
      line: 0,
      col: 0
    });
    return issues;
  }

  if (errorCount !== null && errorCount > 0) {
    issues.push({
      ruleId: 'spix-log-check',
      severity: 'error',
      message: `Spix log has ${errorCount} error${errorCount > 1 ? 's' : ''}`,
      detail: `Total Error count should be 0 but found ${errorCount}`,
      line: 0,
      col: 0
    });
  }

  if (warningCount !== null && warningCount > 0) {
    issues.push({
      ruleId: 'spix-log-check',
      severity: 'warn',
      message: `Spix log has ${warningCount} warning${warningCount > 1 ? 's' : ''}`,
      detail: `Total Warning count should be 0 but found ${warningCount}`,
      line: 0,
      col: 0
    });
  }

  if (exceptionCount !== null && exceptionCount > 0) {
    issues.push({
      ruleId: 'spix-log-check',
      severity: 'error',
      message: `Spix log has ${exceptionCount} exception${exceptionCount > 1 ? 's' : ''}`,
      detail: `Total Exception count should be 0 but found ${exceptionCount}`,
      line: 0,
      col: 0
    });
  }

  return issues;
};

window.RULES['bm-see-also-link-check'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];
  const dom = parsed.dom;
  if (!dom) return issues;

  // Only run on _bm* files
  const fileName = (currentFileName || '').toLowerCase();
  if (!/_bm/.test(fileName)) return issues;

  const elements = Array.from(dom.querySelectorAll('p, li'));

  elements.forEach(el => {
    const html = el.innerHTML || '';

    // Check if "See also" exists in this element
    const seeAlsoMatch = html.match(/See\s+also\s*|See\s+next\s*|(?<!\w)See\s+(?!also|next)/i);
    if (!seeAlsoMatch) return;

    // Get everything after "See also"
    const afterSeeAlso = html.slice(seeAlsoMatch.index + seeAlsoMatch[0].length);

    // Strip all <a>...</a> tags (linked terms) from the remaining HTML
    const stripped = afterSeeAlso
      .replace(/<a[\s\S]*?<\/a>/gi, '')   // remove linked terms
      .replace(/<[^>]+>/g, '')            // remove any other tags
      .replace(/&[a-z0-9#]+;/gi, ' ')    // replace entities
      .trim();

    // If there is still meaningful text left, it's unlinked
    const unlinked = stripped.replace(/[;,.\s]/g, '').trim();
    if (unlinked.length > 0) {
      // Find line number from parsed.elements
      const tag = (el.tagName || '').toLowerCase();
      const id = el.getAttribute('id') || '';
      const matchEl = parsed.elements.find(e =>
        e.tag === tag && (e.attrs.id || '') === id
      );
      issues.push({
        ruleId: 'bm-see-also-link-check',
        severity: ruleCfg.severity || 'error',
        message: `"See also" contains unlinked text: "${stripped.slice(0, 80)}"`,
        detail: html.replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 150),
        line: matchEl ? matchEl.line : 0,
        col: matchEl ? matchEl.col : 0
      });
    }
  });

  return issues;
};

window.RULES['bm-index-roman-check'] = function (parsed, ruleCfg, fileMap, allFiles, currentFileName) {
  const issues = [];
  const dom = parsed.dom;
  if (!dom) return issues;

  // Only run on _bm* files
  const fileName = (currentFileName || '').toLowerCase();
  if (!/_bm/.test(fileName)) return issues;

  const VALID_ROMANS = new Set([
    'i','ii','iii','iv','v','vi','vii','viii','ix','x',
    'xi','xii','xiii','xiv','xv','xvi','xvii','xviii','xix','xx',
    'xxi','xxii','xxiii','xxiv','xxv'
  ]);

  const entries = Array.from(dom.querySelectorAll('li')).filter(li =>
    li.getAttribute('epub:type') === 'index-entry'
  );

  entries.forEach(li => {
    if (li.querySelector('ul')) return;
    // Remove all <a> tags and their content
    const html = li.innerHTML || '';
    const stripped = html
      .replace(/<a[\s\S]*?<\/a>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z0-9#]+;/gi, ' ')
      .trim();

    // Check each word for Roman numeral
    const words = stripped.split(/[\s,;.()]+/).filter(Boolean);
    words.forEach(word => {
      if (VALID_ROMANS.has(word.toLowerCase())) {
        const id = li.getAttribute('id') || '';
        const matchEl = parsed.elements.find(e =>
          e.tag === 'li' && (e.attrs.id || '') === id
        );
        issues.push({
          ruleId: 'bm-index-roman-check',
          severity: ruleCfg.severity || 'error',
          message: `Roman numeral "${word}" found as plain text in index entry`,
          detail: li.innerHTML.replace(/\s*xmlns(:[a-z]+)?="[^"]*"/g, '').slice(0, 150),
          line: matchEl ? matchEl.line : 0,
          col: matchEl ? matchEl.col : 0
        });
      }
    });
  });

  return issues;
};
