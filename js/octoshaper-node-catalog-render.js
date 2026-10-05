/* OctoShaper node catalog renderer.
   Shared by the static site build (pre-renders the default version into nodes.html
   for search engines) and by the browser (re-renders when another version is picked).
   Pure string templating: no DOM access. */
(function (root) {
  function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function nodeSlug(node) {
    return slugify(node.name) + '-' + slugify(String(node.id || '').split('.').pop());
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function channel(value) {
    var n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function cssColor(color) {
    if (!color) return 'rgb(128, 128, 128)';
    return 'rgb(' + Math.round(channel(color.r) * 255) + ', ' + Math.round(channel(color.g) * 255) + ', ' + Math.round(channel(color.b) * 255) + ')';
  }

  function trimNumber(value) {
    var n = Number(value);
    if (!isFinite(n)) return String(value);
    return String(Math.round(n * 10000) / 10000);
  }

  function formatDefault(input) {
    var d = input && input.defaultValue;
    if (!input || !input.hasDefaultValue || !d || d.kind === 'none') return '';
    switch (d.kind) {
      case 'null': return 'None';
      case 'boolean': return d.booleanValue ? 'On' : 'Off';
      case 'integer': return d.stringValue || String(d.integerValue);
      case 'number': return trimNumber(d.numberValue);
      case 'special-number': return d.display === 'Infinity' ? '∞' : d.display;
      case 'string': return d.stringValue === '' ? '""' : '"' + d.stringValue + '"';
      case 'enum': return d.enumName || String(d.enumNumericValue);
      case 'vector3': return '(' + [d.x, d.y, d.z].map(trimNumber).join(', ') + ')';
      case 'quaternion': return '(' + [d.x, d.y, d.z, d.w].map(trimNumber).join(', ') + ')';
      case 'color': return 'RGBA(' + [d.r, d.g, d.b, d.a].map(trimNumber).join(', ') + ')';
      default: return '';
    }
  }

  function typeName(param) {
    return (param && (param.typeDisplayName || param.typeId)) || 'None';
  }

  function isBindable(param) {
    return /ValueOrAttribute$/.test((param && param.typeId) || '');
  }

  function chips(values, className) {
    return values.map(function (value) {
      return '<code class="' + className + '">' + esc(value) + '</code>';
    }).join(' ');
  }

  function renderInputs(node) {
    var inputs = node.inputs || [];
    if (!inputs.length) return '<p class="ct-node__none">No inputs.</p>';
    return '<table class="ct-node__table"><thead><tr><th scope="col">Input</th><th scope="col">Type</th><th scope="col">Default</th></tr></thead><tbody>' +
      inputs.map(function (input) {
        var def = formatDefault(input);
        return '<tr><td><span class="ct-node__port">' + esc(input.name || 'value') + '</span>' +
          (input.description ? '<span class="ct-node__hint">' + esc(input.description) + '</span>' : '') + '</td>' +
          '<td><span class="ct-node__type" style="--type-color: ' + cssColor(input.typeColor) + '">' + esc(typeName(input)) + '</span>' +
          (isBindable(input) ? '<span class="ct-node__bind" title="Accepts a constant value or a per-element attribute">Constant or attribute</span>' : '') + '</td>' +
          '<td>' + (def ? '<code>' + esc(def) + '</code>' : '<span class="ct-node__muted">–</span>') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderNode(node, options) {
    var output = node.output || {};
    var isNew = options.newIds && options.newIds.has(node.id);
    var isLegacy = options.legacyIds && options.legacyIds.has(node.id);
    var requires = node.elementSetRequiredAttributes || [];
    var provides = node.elementSetProvidedAttributes || [];
    var dynamic = [].concat(node.dynamicRequiredAttributeInputNames || [], node.dynamicProvidedAttributeInputNames || [],
      node.dynamicRequiredAttributeBindingInputNames || [], node.dynamicProvidedAttributeBindingInputNames || []);
    var description = node.description && node.description.indexOf('Method: ') !== 0 ? node.description : '';
    var badges = [
      isNew ? '<span class="ct-node__badge ct-node__badge--new">New in ' + esc(options.versionLabel || 'this version') + '</span>' : '',
      isLegacy ? '<span class="ct-node__badge ct-node__badge--legacy" title="Kept for existing graphs, hidden from node search">Legacy</span>' : '',
      '<span class="ct-node__badge' + (node.isAsync ? ' ct-node__badge--async' : '') + '">' + (node.isAsync ? 'Async' : 'Sync') + '</span>'
    ].join('');

    var attributes = (requires.length || provides.length)
      ? '<dl class="ct-node__attrs">' +
        (requires.length ? '<div><dt>Requires</dt><dd>' + chips(requires, 'ct-node__attr') + '</dd></div>' : '') +
        (provides.length ? '<div><dt>Writes</dt><dd>' + chips(provides, 'ct-node__attr ct-node__attr--out') + '</dd></div>' : '') +
        '</dl>'
      : '';

    return '<article class="ct-node' + (isLegacy ? ' is-legacy' : '') + '" id="' + nodeSlug(node) + '"' +
      ' data-async="' + (node.isAsync ? 'true' : 'false') + '"' +
      (isNew ? ' data-new="true"' : '') + (isLegacy ? ' data-legacy="true"' : '') + '>' +
      '<header class="ct-node__head"><h3 class="ct-node__name"><a href="#' + nodeSlug(node) + '">' + esc(node.name) + '</a></h3>' +
      '<div class="ct-node__badges">' + badges + '</div></header>' +
      (description ? '<p class="ct-node__desc">' + esc(description) + '</p>' : '<p class="ct-node__desc ct-node__muted">No description yet.</p>') +
      renderInputs(node) +
      '<p class="ct-node__output"><span class="ct-node__label">Output</span>' +
      (output.name ? '<span class="ct-node__port">' + esc(output.name) + '</span>' : '') +
      '<span class="ct-node__type" style="--type-color: ' + cssColor(output.typeColor) + '">' + esc(typeName(output)) + '</span>' +
      (output.description && output.description !== description ? '<span class="ct-node__hint">' + esc(output.description) + '</span>' : '') + '</p>' +
      attributes +
      '<details class="ct-node__more"><summary>Technical details</summary><dl>' +
      '<div><dt>Node ID</dt><dd><code>' + esc(node.id) + '</code></dd></div>' +
      '<div><dt>C# method</dt><dd><code>' + esc(node.declaringType + '.' + node.methodName) + '</code></dd></div>' +
      (dynamic.length ? '<div><dt>Attribute-name inputs</dt><dd>' + chips(dynamic, 'ct-node__attr') + '</dd></div>' : '') +
      '</dl></details>' +
      '</article>';
  }

  function groupByCategory(nodes) {
    var groups = {};
    nodes.forEach(function (node) {
      var key = node.categoryPath || node.categoryName || 'Uncategorized';
      (groups[key] = groups[key] || { name: key, color: node.categoryColor, nodes: [] }).nodes.push(node);
    });
    return Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); }).map(function (key) {
      var group = groups[key];
      group.nodes.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      return group;
    });
  }

  function categoryLabel(path) {
    return String(path).split('>').map(function (part) { return part.trim(); }).join(' › ');
  }

  function renderCategoryNav(groups) {
    return groups.map(function (group) {
      return '<a class="ct-node-jump" href="#category-' + slugify(group.name) + '" style="--cat-color: ' + cssColor(group.color) + '">' +
        esc(categoryLabel(group.name)) + '<span>' + group.nodes.length + '</span></a>';
    }).join('');
  }

  function renderCatalog(catalog, options) {
    options = options || {};
    var groups = groupByCategory(catalog.nodes || []);
    return groups.map(function (group) {
      return '<section class="ct-node-cat" id="category-' + slugify(group.name) + '" style="--cat-color: ' + cssColor(group.color) + '">' +
        '<header class="ct-node-cat__head"><h2>' + esc(categoryLabel(group.name)) + '</h2>' +
        '<span class="ct-node-cat__count">' + group.nodes.length + ' node' + (group.nodes.length === 1 ? '' : 's') + '</span></header>' +
        group.nodes.map(function (node) { return renderNode(node, options); }).join('') +
        '</section>';
    }).join('\n');
  }

  function summary(catalog, options) {
    var nodes = catalog.nodes || [];
    var legacy = options && options.legacyIds ? nodes.filter(function (n) { return options.legacyIds.has(n.id); }).length : 0;
    return {
      total: nodes.length,
      categories: groupByCategory(nodes).length,
      async: nodes.filter(function (n) { return n.isAsync; }).length,
      added: options && options.newIds ? nodes.filter(function (n) { return options.newIds.has(n.id); }).length : 0,
      legacy: legacy
    };
  }

  function newNodeIds(catalog, previousCatalog) {
    if (!previousCatalog) return new Set();
    var previous = new Set((previousCatalog.nodes || []).map(function (n) { return n.id; }));
    return new Set((catalog.nodes || []).filter(function (n) { return !previous.has(n.id); }).map(function (n) { return n.id; }));
  }

  var api = {
    renderCatalog: renderCatalog,
    renderCategoryNav: renderCategoryNav,
    summary: summary,
    newNodeIds: newNodeIds,
    nodeSlug: nodeSlug,
    slugify: slugify,
    formatDefault: formatDefault
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OctoShaperNodeCatalogRender = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
