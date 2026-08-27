(function() {
  var namespace = window.OctoShaperNodeCatalogData;

  function init() {
    var versionPanel = document.getElementById('octoshaper-version-panel');
    var versionInline = document.getElementById('octoshaper-version-inline');

    if (!namespace) {
      return;
    }

  function updateSidebarLinks(version) {
    document.querySelectorAll('aside nav a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http')) {
        return;
      }

      if (!href.endsWith('.html')) {
        return;
      }

      const url = new URL(href, window.location.href);
      if (version) {
        url.searchParams.set(namespace.versionParamName, version);
      } else {
        url.searchParams.delete(namespace.versionParamName);
      }

      link.setAttribute('href', `${url.pathname.split('/').pop()}${url.search}`);
    });
  }

  function renderInline(entry) {
    if (!versionInline || !entry) {
      return;
    }

    versionInline.textContent = entry.label || `v${entry.version}`;
  }

  function renderPanel(entries, activeEntry) {
    if (!versionPanel || !activeEntry) {
      return;
    }

    versionPanel.innerHTML = `
      <div class="docs-version-control">
        <label for="octoshaper-version-select" class="docs-version-control__label">Version</label>
        <div class="docs-version-control__field">
          <select id="octoshaper-version-select" class="docs-version-control__select focus:outline-none focus:ring-2 focus:ring-[#8a74d8ff]/30" ${entries.length <= 1 ? 'disabled' : ''}>
            ${entries.map(entry => `<option value="${entry.version}" ${entry.version === activeEntry.version ? 'selected' : ''}>${entry.label || `v${entry.version}`}</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    const select = document.getElementById('octoshaper-version-select');
    if (!select) {
      return;
    }

    select.addEventListener('change', event => {
      window.location.href = namespace.setVersionInUrl(event.target.value);
    });
  }

  Promise.all([namespace.getVersionManifest(), namespace.getActiveVersionEntry()])
    .then(([entries, activeEntry]) => {
      renderPanel(entries, activeEntry);
      renderInline(activeEntry);
      updateSidebarLinks(activeEntry.version);
    })
    .catch(error => {
      console.error('Error loading docs version UI:', error);
    });
  }

  if (document.getElementById('octoshaper-version-panel')) {
    init();
  } else {
    window.addEventListener('octoshaper-sidebar-ready', init, { once: true });
  }
})();
