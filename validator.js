/**
 * validator.js
 * Orchestrates parsing + rule execution.
 *
 * Exposes: window.Validator.run(text, ruleState) -> Report
 *
 * Report shape (matches what app.js expects):
 * {
 *   parsed: ParsedDoc,
 *   activeRules: [{ id, name, severity }],
 *   issues: [{ ruleId, severity, message, detail, line, col }],
 *   issueCount: number
 * }
 *
 * ruleState: { [ruleId]: boolean }  — true = enabled
 */

(function () {

  function run(text, ruleState, fileMap, allFiles, currentFileName) {
    const report = {
      parsed: null,
      activeRules: [],
      issues: [],
      issueCount: 0
    };

    // 1. Parse
    const parsed = window.Parser ? window.Parser.parse(text) : { lines: text.split('\n'), dom: null, elements: [], ids: new Map(), errors: [] };
    report.parsed = parsed;

    // 2. Get rule config
    const allRules = Array.isArray(window.RULES_CONFIG) ? window.RULES_CONFIG : [];
    const activeRules = allRules.filter(r => ruleState && ruleState[r.id]);
    report.activeRules = activeRules.map(r => ({ id: r.id, name: r.name, severity: r.severity }));

    // 3. If XML parse error itself, surface as an issue on every active rule that cares,
    //    OR just add a synthetic issue so the user knows.
    if (parsed.errors && parsed.errors.length) {
      parsed.errors.forEach(err => {
        report.issues.push({
          ruleId: 'xml-parse',
          severity: 'error',
          message: 'File could not be fully parsed',
          detail: err,
          line: 1,
          col: 1
        });
      });
    }

    // 4. Run each active rule
    const ruleFns = window.RULES || {};

    activeRules.forEach(ruleCfg => {
      const ruleDef = ruleFns[ruleCfg.id];
      if (!ruleDef) return;
      const fn = typeof ruleDef === 'function' ? ruleDef : ruleDef.check;
      if (typeof fn !== 'function') return;

      let ruleIssues = [];
      try {
        ruleIssues = fn(parsed, ruleCfg, fileMap || new Map(), allFiles || [], currentFileName || '') || [];
      } catch (e) {
        ruleIssues = [{
          ruleId: ruleCfg.id,
          severity: ruleCfg.severity,
          message: 'Rule threw an error: ' + e.message,
          detail: '',
          line: 0,
          col: 0
        }];
      }

      // Ensure every issue has required fields
      ruleIssues.forEach(issue => {
        const normalized = {
          ruleId: issue.ruleId || ruleCfg.id,
          severity: issue.severity || ruleCfg.severity,
          message: issue.message || '',
          detail: issue.detail || '',
          line: issue.line || 0,
          col: issue.col || 0
        };
        if (issue._custom !== undefined) {
          normalized._custom = issue._custom;
        }
        report.issues.push(normalized);
      });
    });

    report.issueCount = report.issues.length;
    return report;
  }

  window.Validator = { run };

})();
