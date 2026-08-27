(function() {
  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function addTableOfContents(article, layout) {
    var headings = Array.prototype.slice.call(article.querySelectorAll('h2'));
    if (headings.length < 2) return;

    var existingToc = layout.querySelector('.docs-toc');
    if (existingToc && existingToc.querySelector('nav a')) {
      observeTableOfContents(existingToc, headings);
      return;
    }

    var usedIds = {};
    headings.forEach(function(heading) {
      var baseId = heading.id || slugify(heading.textContent) || 'section';
      var id = baseId;
      var suffix = 2;
      while (usedIds[id]) {
        id = baseId + '-' + suffix;
        suffix += 1;
      }
      usedIds[id] = true;
      heading.id = id;

      var anchor = document.createElement('a');
      anchor.className = 'docs-heading-anchor';
      anchor.href = '#' + id;
      anchor.setAttribute('aria-label', 'Link to ' + heading.textContent);
      anchor.textContent = '#';
      heading.appendChild(anchor);
    });

    var toc = document.createElement('aside');
    toc.className = 'docs-toc';
    toc.setAttribute('aria-label', 'On this page');
    toc.innerHTML = '<p class="docs-toc__title">On this page</p><nav></nav>';
    var nav = toc.querySelector('nav');

    headings.forEach(function(heading) {
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.childNodes[0].textContent;
      nav.appendChild(link);
    });

    layout.appendChild(toc);

    observeTableOfContents(toc, headings);
  }

  function observeTableOfContents(toc, headings) {
    var nav = toc.querySelector('nav');
    if (!nav) return;

    if (!('IntersectionObserver' in window)) return;

    var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function(link) {
          link.removeAttribute('aria-current');
        });
        var active = nav.querySelector('a[href="#' + entry.target.id + '"]');
        if (active) active.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-15% 0px -70% 0px' });

    headings.forEach(function(heading) { observer.observe(heading); });
  }

  function addMobileNavigation() {
    var container = document.getElementById('octoshaper-docs-sidebar-container');
    if (!container || container.querySelector('.docs-mobile-toggle')) return;

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'docs-mobile-toggle';
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span>Browse documentation</span><span aria-hidden="true">+</span>';
    button.addEventListener('click', function() {
      var isOpen = container.dataset.open === 'true';
      container.dataset.open = String(!isOpen);
      button.setAttribute('aria-expanded', String(!isOpen));
      button.lastElementChild.textContent = isOpen ? '+' : '−';
    });
    container.insertBefore(button, container.firstChild);
  }

  function initialize() {
    var article = document.querySelector('article');
    var layout = article && article.parentElement;
    if (!article || !layout) return;

    document.body.classList.add('docs-page');
    article.classList.add('docs-article');
    layout.classList.add('docs-layout');
    var shell = layout.closest('section');
    if (shell) shell.classList.add('docs-shell');

    addTableOfContents(article, layout);
    addMobileNavigation();
  }

  document.addEventListener('DOMContentLoaded', initialize);
  window.addEventListener('octoshaper-sidebar-ready', addMobileNavigation);
})();
