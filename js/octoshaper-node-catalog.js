/* Node catalog page: filtering over the pre-rendered list, and re-rendering
   when the reader picks another OctoShaper version. */
(function () {
  var data = window.OctoShaperNodeCatalogData;
  var render = window.OctoShaperNodeCatalogRender;
  var list = document.getElementById('node-catalog-list');
  var nav = document.getElementById('node-category-nav');
  var search = document.getElementById('node-search-input');
  var count = document.getElementById('node-results-count');
  var empty = document.getElementById('node-empty');
  var summary = document.getElementById('node-summary');
  var filter = '';

  if (!data || !render || !list) return;

  function applyFilters() {
    var query = (search && search.value || '').trim().toLowerCase();
    var shown = 0;
    Array.prototype.forEach.call(list.querySelectorAll('.ct-node-cat'), function (section) {
      var visibleInSection = 0;
      Array.prototype.forEach.call(section.querySelectorAll('.ct-node'), function (node) {
        var ok = true;
        if (filter === 'async') ok = node.dataset.async === 'true';
        else if (filter === 'sync') ok = node.dataset.async !== 'true';
        else if (filter === 'new') ok = node.dataset.new === 'true';
        else if (filter === 'legacy') ok = node.dataset.legacy === 'true';
        if (ok && query) {
          if (!node._haystack) node._haystack = node.textContent.toLowerCase();
          ok = node._haystack.indexOf(query) !== -1;
        }
        node.hidden = !ok;
        if (ok) visibleInSection += 1;
      });
      section.hidden = visibleInSection === 0;
      shown += visibleInSection;
    });
    if (count) count.textContent = shown + ' node' + (shown === 1 ? '' : 's');
    if (empty) empty.hidden = shown !== 0;
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-node-filter]');
    if (!button) return;
    filter = button.getAttribute('data-node-filter') || '';
    Array.prototype.forEach.call(document.querySelectorAll('[data-node-filter]'), function (chip) {
      var active = chip === button;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    applyFilters();
  });

  if (search) {
    search.addEventListener('input', applyFilters);
  }

  function renderSummary(stats, label) {
    if (!summary) return;
    summary.innerHTML =
      '<div><strong>' + stats.total + '</strong><span>nodes</span></div>' +
      '<div><strong>' + stats.categories + '</strong><span>categories</span></div>' +
      '<div><strong>' + stats.async + '</strong><span>async</span></div>' +
      (stats.added ? '<div><strong>' + stats.added + '</strong><span>new in ' + label + '</span></div>' : '');
  }

  function rerenderFor(entry) {
    return Promise.all([data.getVersionManifest(), data.getCatalog(entry.version)]).then(function (results) {
      var manifest = results[0];
      var catalog = results[1];
      var index = manifest.findIndex(function (item) { return item.version === entry.version; });
      var previous = manifest[index + 1];
      var previousPromise = previous ? data.getCatalog(previous.version) : Promise.resolve(null);
      return previousPromise.then(function (previousCatalog) {
        var options = {
          newIds: render.newNodeIds(catalog, previousCatalog),
          legacyIds: new Set(entry.legacyNodeIds || []),
          versionLabel: entry.label || ('v' + entry.version)
        };
        list.innerHTML = render.renderCatalog(catalog, options);
        list.setAttribute('data-rendered-version', entry.version);
        if (nav) nav.innerHTML = render.renderCategoryNav(
          Object.values(catalog.nodes.reduce(function (groups, node) {
            var key = node.categoryPath || node.categoryName;
            (groups[key] = groups[key] || { name: key, color: node.categoryColor, nodes: [] }).nodes.push(node);
            return groups;
          }, {})).sort(function (a, b) { return a.name.localeCompare(b.name); })
        );
        renderSummary(render.summary(catalog, options), options.versionLabel);
        applyFilters();
        if (window.location.hash) {
          var target = document.getElementById(window.location.hash.slice(1));
          if (target) target.scrollIntoView();
        }
      });
    });
  }

  data.getActiveVersionEntry().then(function (entry) {
    if (entry && entry.version !== list.getAttribute('data-rendered-version')) {
      return rerenderFor(entry);
    }
    applyFilters();
  }).catch(function (error) {
    console.error('Error loading the node catalog:', error);
    applyFilters();
  });
}());
