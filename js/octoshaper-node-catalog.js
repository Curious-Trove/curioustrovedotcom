(function() {
  const namespace = window.OctoShaperNodeCatalogData;
  const asyncFilter = document.getElementById('node-async-filter');
  const sidebarSubmenu = document.getElementById('node-sidebar-submenu');
  const searchInput = document.getElementById('node-search-input');
  const resultsCount = document.getElementById('node-results-count');
  const summaryTotal = document.getElementById('node-summary-total');
  const summaryCategories = document.getElementById('node-summary-categories');
  const summaryAsync = document.getElementById('node-summary-async');
  const listContainer = document.getElementById('node-catalog-list');
  const filters = {
    execution: ''
  };

  if (!namespace || !listContainer) {
    return;
  }

  function getCategoryTheme(catalog, category) {
    return catalog.categoryMap?.get(category)?.theme || namespace.buildCategoryTheme(null);
  }

  function renderFilters(catalog) {
    if (sidebarSubmenu) {
      const versionQuery = catalog.versionInfo?.version
        ? `?${namespace.versionParamName}=${encodeURIComponent(catalog.versionInfo.version)}`
        : '';

      sidebarSubmenu.innerHTML = catalog.categoriesByName.map(category => `
        <a href="nodes.html${versionQuery}#category-${namespace.slugify(category)}" class="block rounded-lg px-3 py-2 text-sm font-bold text-brand-dark transition-colors" style="background-color: ${getCategoryTheme(catalog, category).backgroundSoft}; border-left: 3px solid ${getCategoryTheme(catalog, category).border};">
          <span class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full" style="background-color: ${getCategoryTheme(catalog, category).accent};"></span>
            <span>${category}</span>
          </span>
        </a>
      `).join('');
    }

    if (asyncFilter) {
      const options = [
        { value: '', label: 'All nodes' },
        { value: 'sync', label: 'Sync' },
        { value: 'async', label: 'Async' }
      ];

      asyncFilter.innerHTML = options.map(option => `
        <button type="button" data-filter-execution="${option.value}" class="node-filter-chip rounded-full border px-4 py-2 text-sm font-bold transition-colors ${filters.execution === option.value ? 'border-[#8ce2b8] bg-[#eafaf1] text-[#1e5a3c]' : 'border-brand-border bg-[#f8f9fa] text-brand-dark hover:border-[#8ce2b8] hover:text-[#1e5a3c]'}">
          ${option.label}
        </button>
      `).join('');
    }
  }

  function renderSummary(catalog) {
    if (summaryTotal) {
      summaryTotal.textContent = String(catalog.nodes.length);
    }

    if (summaryCategories) {
      summaryCategories.textContent = String(catalog.categoriesByName.length);
    }

    if (summaryAsync) {
      summaryAsync.textContent = String(catalog.asyncCount);
    }
  }

  function filterNodes(nodes) {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const selectedAsync = filters.execution;

    return nodes.filter(node => {
      if (selectedAsync === 'async' && !node.isAsync) {
        return false;
      }

      if (selectedAsync === 'sync' && node.isAsync) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        node.name,
        node.description,
        node.categoryName,
        node.methodName,
        node.declaringType,
        ...(node.elementSetProvidedAttributes || []),
        ...(node.elementSetRequiredAttributes || []),
        ...(node.dynamicProvidedAttributeInputNames || []),
        ...(node.dynamicRequiredAttributeInputNames || [])
      ].join(' ').toLowerCase();

      return haystack.includes(query);
    });
  }

  function buildSignature(node) {
    const inputs = (node.inputs || []).map(input => `${input.name || 'value'}: ${namespace.formatType(input.typeId, input.typeDisplayName)}`);
    const outputType = namespace.formatType(node.output?.typeId, node.output?.typeDisplayName);
    return `${inputs.join(', ')} -> ${outputType}`;
  }

  function buildInputSummary(node) {
    const inputs = node.inputs || [];
    if (!inputs.length) {
      return '<span class="rounded-md border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-gray">No inputs</span>';
    }

    return inputs.map(input => `
      <span class="rounded-md border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-dark">
        ${input.name || 'value'}
        <span class="ml-1 text-brand-gray">${namespace.formatType(input.typeId, input.typeDisplayName)}</span>
      </span>
    `).join('');
  }

  function renderSectionCard(title, toneClass, body) {
    return `
      <section class="rounded-2xl border ${toneClass} p-4">
        <p class="text-xs font-extrabold uppercase tracking-[0.16em] mb-2">${title}</p>
        ${body}
      </section>
    `;
  }

  function formatAttributeSummary(label, values) {
    if (!values || !values.length) {
      return '';
    }

    return `
      <div class="flex items-start gap-2 flex-wrap">
        <span class="text-xs font-bold uppercase tracking-[0.14em] text-brand-gray">${label}</span>
        <div class="flex flex-wrap gap-2">
          ${values.map(value => `<span class="rounded-md border border-brand-border bg-[#f8f9fa] px-2.5 py-1 text-xs font-bold text-brand-dark">${value}</span>`).join('')}
        </div>
      </div>
    `;
  }

  function renderNodes(catalog, nodes) {
    if (resultsCount) {
      resultsCount.textContent = `${nodes.length} node${nodes.length === 1 ? '' : 's'}`;
    }

    if (!nodes.length) {
      listContainer.innerHTML = '<div class="bg-white border border-brand-border rounded-3xl p-8 text-center text-brand-gray shadow-sm">No nodes match the current filters.</div>';
      return;
    }

    const groupedNodes = nodes.reduce((accumulator, node) => {
      const key = node.categoryPath || node.categoryName || 'Uncategorized';
      if (!accumulator[key]) {
        accumulator[key] = [];
      }

      accumulator[key].push(node);
      return accumulator;
    }, {});

    listContainer.innerHTML = Object.keys(groupedNodes)
      .sort((left, right) => left.localeCompare(right))
      .map(category => {
        const categoryNodes = groupedNodes[category];
        const theme = getCategoryTheme(catalog, category);

        return `
          <section id="category-${namespace.slugify(category)}" class="bg-white border rounded-3xl shadow-sm overflow-hidden scroll-mt-8" style="border-color: ${theme.border}; box-shadow: inset 0 0 0 1px ${theme.backgroundSoft};">
            <div class="border-b px-6 py-5 md:px-8" style="border-color: ${theme.border}; background: linear-gradient(135deg, ${theme.background} 0%, rgba(255,255,255,0.96) 70%);">
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-xs font-extrabold uppercase tracking-[0.18em] mb-1" style="color: ${theme.accentStrong || '#4a4a4a'};">Category</p>
                  <h2 class="text-2xl font-extrabold text-brand-dark flex items-center gap-3"><span class="inline-block h-3 w-3 rounded-full" style="background-color: ${theme.accent};"></span>${category}</h2>
                </div>
                <span class="rounded-full border bg-white px-3 py-1 text-sm font-bold text-brand-dark" style="border-color: ${theme.border};">${categoryNodes.length} node${categoryNodes.length === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div class="divide-y divide-brand-border">
              ${categoryNodes.map(node => {
                const inputCount = node.inputs ? node.inputs.length : 0;
                const outputType = namespace.formatType(node.output?.typeId, node.output?.typeDisplayName);
                const dynamicInputs = [
                  ...(node.dynamicRequiredAttributeInputNames || []),
                  ...(node.dynamicProvidedAttributeInputNames || []),
                  ...(node.dynamicRequiredAttributeBindingInputNames || []),
                  ...(node.dynamicProvidedAttributeBindingInputNames || [])
                ];

                return `
                  <article id="${namespace.createNodeSlug(node)}" class="px-6 py-6 md:px-8" style="background: linear-gradient(180deg, ${theme.backgroundSoft} 0%, rgba(255,255,255,0) 65%); border-left: 4px solid ${theme.border};">
                    <div class="flex items-start justify-between gap-4 flex-wrap mb-3">
                      <div>
                        <h3 class="text-2xl font-extrabold text-brand-dark mb-2 flex items-center gap-3"><span class="inline-block h-2.5 w-2.5 rounded-full" style="background-color: ${theme.accent};"></span>${node.name}</h3>
                        <p class="text-brand-gray leading-relaxed max-w-4xl">${node.description || 'No description provided.'}</p>
                      </div>
                      <span class="${node.isAsync ? 'bg-[#eafaf1] text-[#1e5a3c] border-[#8ce2b8]' : 'text-brand-dark'} text-xs font-bold px-3 py-1 rounded-md border whitespace-nowrap" style="${node.isAsync ? '' : `background-color: ${theme.backgroundSoft}; border-color: ${theme.border};`} ">${node.isAsync ? 'Async' : 'Sync'}</span>
                    </div>

                    <div class="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-4 mb-4">
                      ${renderSectionCard('Signature', '', `<p class="font-mono text-sm text-brand-dark break-words">${buildSignature(node)}</p>`).replace('<section class="rounded-2xl border  p-4">', `<section class="rounded-2xl border p-4" style="border-color: ${theme.border}; background-color: ${theme.background}; color: ${theme.accentStrong || '#5a358c'};">`)}
                      ${renderSectionCard('Quick Facts', 'border-brand-border bg-[#f8f9fa] text-brand-gray', `
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="rounded-full border border-brand-border bg-white px-3 py-1 text-xs font-bold text-brand-dark">${inputCount} input${inputCount === 1 ? '' : 's'}</span>
                          <span class="rounded-full border border-brand-border bg-white px-3 py-1 text-xs font-bold text-brand-dark">Output: ${outputType}</span>
                          <span class="rounded-full border border-brand-border bg-white px-3 py-1 text-xs font-bold text-brand-dark">${node.methodName}</span>
                        </div>
                      `)}
                    </div>

                    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
                      ${renderSectionCard('Inputs', 'border-brand-border bg-white text-brand-gray', `<div class="flex flex-wrap gap-2">${buildInputSummary(node)}</div>`)}
                      ${renderSectionCard('Element Attributes', 'border-[#8ce2b8] bg-[#f3fbf7] text-[#1e5a3c]', `
                        <div class="space-y-3">
                          ${formatAttributeSummary('Requires', node.elementSetRequiredAttributes || []) || '<p class="text-sm text-brand-gray">No required element attributes.</p>'}
                          ${formatAttributeSummary('Provides', node.elementSetProvidedAttributes || []) || '<p class="text-sm text-brand-gray">No provided element attributes.</p>'}
                        </div>
                      `)}
                      ${renderSectionCard('Dynamic Metadata', 'border-[#8a74d8ff]/15 bg-[#faf7fd] text-[#5a358c]', `
                        ${dynamicInputs.length ? `<div class="flex flex-wrap gap-2">${dynamicInputs.map(value => `<span class="rounded-md border border-[#8a74d8ff]/20 bg-white px-3 py-2 text-xs font-bold text-brand-dark">${value}</span>`).join('')}</div>` : '<p class="text-sm text-brand-gray">No dynamic attribute inputs.</p>'}
                      `)}
                    </div>

                    <div class="flex items-center justify-between gap-4 flex-wrap text-sm">
                      <p class="text-brand-gray font-medium break-all">${node.declaringType}</p>
                      <p class="text-brand-gray">${node.assemblyName}</p>
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
          </section>
        `;
      })
      .join('');
  }

  function attachEvents(catalog) {
    const rerender = () => renderNodes(catalog, filterNodes(catalog.nodes));

    if (asyncFilter) {
      asyncFilter.addEventListener('click', event => {
        const button = event.target.closest('[data-filter-execution]');
        if (!button) {
          return;
        }

        filters.execution = button.dataset.filterExecution || '';
        renderFilters(catalog);
        rerender();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', rerender);
    }
  }

  namespace.getCatalog()
    .then(catalog => {
      renderFilters(catalog);
      renderSummary(catalog);
      renderNodes(catalog, catalog.nodes);
      attachEvents(catalog);
    })
    .catch(error => {
      console.error('Error rendering node catalog:', error);
      listContainer.innerHTML = '<div class="col-span-full bg-white border border-brand-border rounded-3xl p-8 text-center text-brand-gray shadow-sm">Unable to load the node catalog right now.</div>';
    });
})();