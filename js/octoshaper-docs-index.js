(function() {
  const docsList = document.getElementById('docs-list');
  const namespace = window.OctoShaperNodeCatalogData;

  if (!docsList) {
    return;
  }

  function withVersion(url) {
    if (!namespace) {
      return url;
    }

    const version = namespace.getVersionFromUrl();
    if (!version) {
      return url;
    }

    const resolved = new URL(url, window.location.href);
    resolved.searchParams.set(namespace.versionParamName, version);
    return `${resolved.pathname.split('/').pop()}${resolved.search}`;
  }

  fetch('../../data/octoshaper-docs.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to load documentation index');
      }

      return response.json();
    })
    .then(entries => {
      docsList.innerHTML = entries.map(entry => `
        <a href="${withVersion(entry.url)}" class="group bg-white border border-brand-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
          <div class="flex items-center justify-between gap-3 mb-4">
            <span class="text-xs font-bold uppercase tracking-[0.18em] text-brand-gray">${entry.category}</span>
            <span class="bg-[#eafaf1] text-[#1e5a3c] text-xs font-bold px-3 py-1 rounded-md border border-[#8ce2b8]">${entry.status}</span>
          </div>
          <h3 class="text-2xl font-extrabold text-brand-dark mb-3 group-hover:text-[#8a74d8ff] transition-colors">${entry.title}</h3>
          <p class="text-brand-gray leading-relaxed mb-5">${entry.summary}</p>
          <div class="flex items-center justify-between text-sm font-bold text-[#8a74d8ff]">
            <span>${entry.readTime}</span>
            <span>Open page</span>
          </div>
        </a>
      `).join('');
    })
    .catch(error => {
      console.error('Error loading docs index:', error);
      docsList.innerHTML = '<p class="text-brand-gray text-center col-span-full">Documentation pages are not available right now.</p>';
    });
})();