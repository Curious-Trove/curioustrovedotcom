(function() {
  const namespace = window.OctoShaperNodeCatalogData;
  const versionPanel = document.getElementById('octoshaper-version-panel');
  const versionInline = document.getElementById('octoshaper-version-inline');

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
      <div class="rounded-2xl border border-brand-border bg-[#f8f9fa] p-4 mb-4">
        <p class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-gray mb-2">Docs Version</p>
        <label class="block">
          <span class="block text-sm font-bold text-brand-dark mb-2">Current version</span>
          <select id="octoshaper-version-select" class="w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm font-bold text-brand-dark focus:outline-none focus:ring-2 focus:ring-[#8a74d8ff]/30" ${entries.length <= 1 ? 'disabled' : ''}>
            ${entries.map(entry => `<option value="${entry.version}" ${entry.version === activeEntry.version ? 'selected' : ''}>${entry.label || `v${entry.version}`}</option>`).join('')}
          </select>
        </label>
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
})();