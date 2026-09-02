/**
 * parser.js
 * Parses raw XHTML text into a structured object for rule validation.
 *
 * Exposes: window.Parser.parse(text) -> ParsedDoc
 *
 * ParsedDoc shape:
 * {
 *   lines: string[],           // raw lines (1-indexed via lines[lineNum-1])
 *   dom: Document,             // native DOM (DOMParser)
 *   elements: ElementInfo[],   // flat list of all elements with line info
 *   ids: Map<string, number>,  // id -> line number
 *   errors: string[]           // parse-level errors (e.g. XML parse fail)
 * }
 *
 * ElementInfo shape:
 * {
 *   tag: string,
 *   attrs: { [name]: value },
 *   line: number,
 *   col: number,
 *   textContent: string,
 *   outerHTML: string
 * }
 */

(function () {

  /**
   * Build a line-number lookup map from raw text.
   * We scan the raw text to find every opening tag and record which line it's on.
   * This gives us approximate line numbers since DOMParser doesn't provide them.
   */
  function buildLineMap(text) {
    // lineMap[i] = line number of character index i
    const lines = text.split('\n');
    const charToLine = new Map();
    let charIdx = 0;
    lines.forEach((line, i) => {
      for (let c = 0; c < line.length + 1; c++) { // +1 for \n
        charToLine.set(charIdx + c, i + 1);
      }
      charIdx += line.length + 1;
    });
    return { lines, charToLine };
  }

  /**
   * For a given tag name and attribute string, find its first occurrence line in raw text.
   * We walk through matches to assign unique line numbers per element occurrence.
   */
  function buildTagPositions(text, lines) {
    // Returns array of { tag, line, col, index } for every opening tag found
    const positions = [];
    // Matches <tagName ...> or <tagName> or <tagName/>
    const tagRe = /<([a-zA-Z][a-zA-Z0-9:_-]*)((?:\s[^>]*)?)\s*\/?>/g;
    let lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') lineStarts.push(i + 1);
    }

    function indexToLineCol(idx) {
      let lo = 0, hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (lineStarts[mid] <= idx) lo = mid;
        else hi = mid - 1;
      }
      return { line: lo + 1, col: idx - lineStarts[lo] + 1 };
    }

    let m;
    while ((m = tagRe.exec(text)) !== null) {
      const { line, col } = indexToLineCol(m.index);
      positions.push({ tag: m[1].toLowerCase(), attrStr: m[2] || '', index: m.index, line, col });
    }
    return positions;
  }

  /**
   * Parse attributes from an attribute string.
   */
  function parseAttrs(attrStr) {
    const attrs = {};
    const re = /([a-zA-Z][a-zA-Z0-9:_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let m;
    while ((m = re.exec(attrStr)) !== null) {
      if (!m[1]) continue;
      attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2]
        : m[3] !== undefined ? m[3]
        : m[4] !== undefined ? m[4]
        : '';
    }
    return attrs;
  }

  /**
   * Main parse function.
   */
  function parse(text) {
    const result = {
      lines: [],
      dom: null,
      elements: [],
      ids: new Map(),
      errors: []
    };

    if (!text || !text.trim()) {
      result.errors.push('Empty file');
      return result;
    }

    result.lines = text.split('\n');

    // Parse DOM
    let dom;
    try {
      const parser = new DOMParser();
      dom = parser.parseFromString(text, 'application/xhtml+xml');
      const parseErr = dom.querySelector('parsererror');
      if (parseErr) {
        result.errors.push('XML parse error: ' + parseErr.textContent.trim().slice(0, 200));
        // Still try to continue with what we have via HTML parser
        const htmlParser = new DOMParser();
        dom = htmlParser.parseFromString(text, 'text/html');
      }
    } catch (e) {
      result.errors.push('Parse exception: ' + e.message);
      result.dom = null;
      return result;
    }

    result.dom = dom;

    // Build tag position list from raw text for line numbers
    const tagPositions = buildTagPositions(text, result.lines);
    // Index by tag name for O(1) lookup; we pop from front as we walk DOM
    const tagQueues = {};
    tagPositions.forEach(tp => {
      if (!tagQueues[tp.tag]) tagQueues[tp.tag] = [];
      tagQueues[tp.tag].push(tp);
    });

    // Walk every element in the DOM
    const allEls = dom.querySelectorAll('*');
    allEls.forEach(el => {
      const tag = el.tagName.toLowerCase();
      const queue = tagQueues[tag];
      let line = 0, col = 0;
      if (queue && queue.length) {
        const pos = queue.shift();
        line = pos.line;
        col = pos.col;
      }

      const attrs = {};
      Array.from(el.attributes || []).forEach(a => {
        attrs[a.name.toLowerCase()] = a.value;
      });

      const info = {
        tag,
        attrs,
        line,
        col,
        textContent: (el.textContent || '').trim(),
        outerHTML: el.outerHTML ? el.outerHTML.slice(0, 300) : ''
      };

      result.elements.push(info);

      // Track IDs
      if (attrs.id) {
        if (result.ids.has(attrs.id)) {
          // duplicate — store as array
          const existing = result.ids.get(attrs.id);
          if (!Array.isArray(existing)) result.ids.set(attrs.id, [existing, line]);
          else existing.push(line);
        } else {
          result.ids.set(attrs.id, line);
        }
      }
    });

    return result;
  }

  window.Parser = { parse };

})();
