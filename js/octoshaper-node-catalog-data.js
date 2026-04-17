(function() {
  const body = document.body;
  const basePath = body?.dataset.basePath || '';
  const versionParamName = 'version';
  const manifestPath = `${basePath}data/octoshaper-docs-versions.json`;
  let versionManifestPromise;
  const catalogPromises = new Map();

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function createNodeSlug(node) {
    return `${slugify(node.name)}-${slugify(node.id.split('.').pop())}`;
  }

  function formatType(typeId, typeDisplayName) {
    return typeDisplayName || typeId || 'Unknown';
  }

  function formatDefaultValue(defaultValue) {
    if (!defaultValue || defaultValue.kind === 'none') {
      return 'None';
    }

    if (defaultValue.display) {
      return defaultValue.display;
    }

    if (defaultValue.stringValue) {
      return defaultValue.stringValue;
    }

    if (defaultValue.kind === 'boolean') {
      return defaultValue.booleanValue ? 'True' : 'False';
    }

    if (defaultValue.kind === 'integer') {
      return String(defaultValue.integerValue);
    }

    if (defaultValue.kind === 'number') {
      return String(defaultValue.numberValue);
    }

    if (defaultValue.kind === 'enum') {
      return defaultValue.enumName || String(defaultValue.enumNumericValue);
    }

    if (defaultValue.kind === 'vector3') {
      return `(${defaultValue.x}, ${defaultValue.y}, ${defaultValue.z})`;
    }

    if (defaultValue.kind === 'vector4') {
      return `(${defaultValue.x}, ${defaultValue.y}, ${defaultValue.z}, ${defaultValue.w})`;
    }

    if (defaultValue.kind === 'color') {
      return `rgba(${defaultValue.r}, ${defaultValue.g}, ${defaultValue.b}, ${defaultValue.a})`;
    }

    return defaultValue.kind;
  }

  function clampChannel(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.max(0, Math.min(1, numericValue));
  }

  function toCssColor(color, alphaMultiplier) {
    if (!color) {
      return '';
    }

    const red = Math.round(clampChannel(color.r) * 255);
    const green = Math.round(clampChannel(color.g) * 255);
    const blue = Math.round(clampChannel(color.b) * 255);
    const alpha = Math.max(0, Math.min(1, clampChannel(color.a === undefined ? 1 : color.a) * (alphaMultiplier === undefined ? 1 : alphaMultiplier)));
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function buildCategoryTheme(categoryColor) {
    return {
      accent: toCssColor(categoryColor, 1),
      accentStrong: toCssColor(categoryColor, 0.9),
      border: toCssColor(categoryColor, 0.28),
      background: toCssColor(categoryColor, 0.1),
      backgroundSoft: toCssColor(categoryColor, 0.06),
      chip: toCssColor(categoryColor, 0.14)
    };
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }

  function getVersionFromUrl() {
    return new URLSearchParams(window.location.search).get(versionParamName) || '';
  }

  function setVersionInUrl(version) {
    const url = new URL(window.location.href);
    if (version) {
      url.searchParams.set(versionParamName, version);
    } else {
      url.searchParams.delete(versionParamName);
    }

    return url.toString();
  }

  function getVersionManifest() {
    if (!versionManifestPromise) {
      versionManifestPromise = fetch(manifestPath)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to load OctoShaper docs versions manifest');
          }

          return response.json();
        });
    }

    return versionManifestPromise;
  }

  function getActiveVersionEntry() {
    return getVersionManifest().then(entries => {
      const requestedVersion = getVersionFromUrl();
      return entries.find(entry => entry.version === requestedVersion)
        || entries.find(entry => entry.default)
        || entries[0];
    });
  }

  function getCatalog(version) {
    const loadCatalogForEntry = versionEntry => {
      const cacheKey = versionEntry.version;
      if (!catalogPromises.has(cacheKey)) {
        catalogPromises.set(cacheKey, fetch(`${basePath}${versionEntry.catalogPath}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to load OctoShaper node catalog');
          }

          return response.json();
        })
        .then(catalog => {
          const nodes = [...(catalog.nodes || [])].sort((left, right) => {
            const categoryCompare = (left.categoryPath || '').localeCompare(right.categoryPath || '');
            if (categoryCompare !== 0) {
              return categoryCompare;
            }

            return (left.name || '').localeCompare(right.name || '');
          });

          const categoryMap = new Map();
          nodes.forEach(node => {
            const categoryKey = node.categoryPath || node.categoryName || 'Uncategorized';
            if (!categoryMap.has(categoryKey)) {
              categoryMap.set(categoryKey, {
                name: categoryKey,
                color: node.categoryColor || null,
                styleClass: node.categoryStyleClass || '',
                theme: buildCategoryTheme(node.categoryColor || null)
              });
            }
          });

          return {
            ...catalog,
            nodes,
            nodeMap: new Map(nodes.map(node => [node.id, node])),
            categoryMap,
            categoriesByName: uniqueSorted(nodes.map(node => node.categoryName)),
            asyncCount: nodes.filter(node => node.isAsync).length,
            versionInfo: {
              version: catalog.generator?.octoShaperVersion || versionEntry.version,
              label: versionEntry.label || `v${catalog.generator?.octoShaperVersion || versionEntry.version}`,
              catalogPath: versionEntry.catalogPath
            }
          };
        }));
      }

      return catalogPromises.get(cacheKey);
    };

    if (version) {
      return getVersionManifest().then(entries => {
        const versionEntry = entries.find(entry => entry.version === version)
          || entries.find(entry => entry.default)
          || entries[0];
        return loadCatalogForEntry(versionEntry);
      });
    }

    return getActiveVersionEntry().then(loadCatalogForEntry);
  }

  window.OctoShaperNodeCatalogData = {
    createNodeSlug,
    formatDefaultValue,
    formatType,
    buildCategoryTheme,
    getCatalog,
    getActiveVersionEntry,
    getVersionManifest,
    getVersionFromUrl,
    setVersionInUrl,
    slugify,
    toCssColor,
    uniqueSorted,
    versionParamName
  };
})();