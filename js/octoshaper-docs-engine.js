(function() {
  var engines = ['unity', 'godot'];
  var availability = {
    unity: true,
    godot: false
  };
  var storageKey = 'octoshaper-engine-edition';
  var parameterName = 'engine';
  var activeEngine = 'unity';
  var linkObserver;

  function getRequestedEngine() {
    var requested = new URLSearchParams(window.location.search).get(parameterName);
    if (engines.indexOf(requested) !== -1) {
      return requested;
    }

    try {
      var saved = window.localStorage.getItem(storageKey);
      return engines.indexOf(saved) !== -1 ? saved : 'unity';
    } catch (error) {
      return 'unity';
    }
  }

  function updateLocation(engine) {
    var url = new URL(window.location.href);
    if (engine === 'unity') {
      url.searchParams.delete(parameterName);
    } else {
      url.searchParams.set(parameterName, engine);
    }
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  function decorateLink(link, engine) {
    var href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }

    var url;
    try {
      url = new URL(href, window.location.href);
    } catch (error) {
      return;
    }

    if (url.origin !== window.location.origin || url.pathname.indexOf('/octoshaper/docs/') === -1) {
      return;
    }

    if (engine === 'unity') {
      url.searchParams.delete(parameterName);
    } else {
      url.searchParams.set(parameterName, engine);
    }

    link.setAttribute('href', url.pathname.split('/').pop() + url.search + url.hash);
  }

  function updateLinks(engine, root) {
    var scope = root && root.querySelectorAll ? root : document;
    if (root && root.matches && root.matches('a[href]')) {
      decorateLink(root, engine);
    }
    Array.prototype.forEach.call(scope.querySelectorAll('a[href]'), function(link) {
      decorateLink(link, engine);
    });
  }

  function observeLinks() {
    if (linkObserver || !('MutationObserver' in window)) {
      return;
    }

    linkObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        Array.prototype.forEach.call(mutation.addedNodes, function(node) {
          if (node.nodeType === 1) {
            updateLinks(activeEngine, node);
          }
        });
      });
      updateAvailability(activeEngine);
    });
    linkObserver.observe(document.body, { childList: true, subtree: true });
  }

  function updateChoices(engine) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-docs-engine-choice]'), function(choice) {
      choice.setAttribute('aria-pressed', String(choice.dataset.docsEngineChoice === engine));
    });
  }

  function updateEngineSpecificContent(engine) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-docs-engine]'), function(element) {
      element.hidden = element.dataset.docsEngine !== engine;
    });
  }

  function getLayout() {
    var sidebar = document.getElementById('octoshaper-docs-sidebar-container');
    return sidebar && sidebar.parentElement;
  }

  function getContentRoots(layout) {
    if (!layout) {
      return [];
    }

    return Array.prototype.filter.call(layout.children, function(child) {
      return child.id !== 'octoshaper-docs-sidebar-container' &&
        !child.classList.contains('docs-toc') &&
        !child.classList.contains('docs-engine-unavailable');
    });
  }

  function createUnavailablePanel(layout) {
    var panel = layout.querySelector('.docs-engine-unavailable');
    if (panel) {
      return panel;
    }

    panel = document.createElement('section');
    panel.className = 'docs-engine-unavailable';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML =
      '<div class="docs-engine-unavailable__content">' +
        '<div class="docs-engine-unavailable__icon"><img src="../../res/godot-icon.png" alt=""></div>' +
        '<p class="docs-engine-unavailable__eyebrow">Godot edition · In development</p>' +
        '<h1>Godot documentation is not available yet</h1>' +
        '<p>OctoShaper for Godot has not been released, so these pages currently document the Unity edition only. The Godot documentation will appear here as the integration becomes ready.</p>' +
        '<button type="button" data-docs-engine-return-unity>View Unity documentation</button>' +
      '</div>';

    var sidebar = document.getElementById('octoshaper-docs-sidebar-container');
    layout.insertBefore(panel, sidebar.nextSibling);
    panel.querySelector('[data-docs-engine-return-unity]').addEventListener('click', function() {
      setEngine('unity', true);
    });
    return panel;
  }

  function updateEmbeddedMedia(root, unavailable) {
    Array.prototype.forEach.call(root.querySelectorAll('video'), function(video) {
      if (unavailable) {
        video.pause();
      } else if (video.autoplay) {
        var playAttempt = video.play();
        if (playAttempt && typeof playAttempt.catch === 'function') {
          playAttempt.catch(function() {});
        }
      }
    });

    Array.prototype.forEach.call(root.querySelectorAll('iframe[src], iframe[data-docs-engine-src]'), function(frame) {
      if (unavailable) {
        if (frame.hasAttribute('src')) {
          frame.dataset.docsEngineSrc = frame.getAttribute('src');
          frame.removeAttribute('src');
        }
      } else if (!frame.hasAttribute('src') && frame.dataset.docsEngineSrc) {
        frame.setAttribute('src', frame.dataset.docsEngineSrc);
      }
    });
  }

  function updateAvailability(engine) {
    var layout = getLayout();
    if (!layout) {
      return;
    }

    var unavailable = !availability[engine];
    var panel = layout.querySelector('.docs-engine-unavailable');
    getContentRoots(layout).forEach(function(root) {
      root.hidden = unavailable;
      updateEmbeddedMedia(root, unavailable);
    });
    Array.prototype.forEach.call(layout.querySelectorAll('.docs-toc'), function(toc) {
      toc.hidden = unavailable;
    });

    if (unavailable) {
      panel = createUnavailablePanel(layout);
      panel.hidden = false;
    } else if (panel) {
      panel.hidden = true;
    }

    document.body.classList.toggle('docs-engine-is-unavailable', unavailable);
  }

  function setEngine(engine, updateUrl) {
    activeEngine = engines.indexOf(engine) !== -1 ? engine : 'unity';
    document.body.dataset.docsEngine = activeEngine;
    updateChoices(activeEngine);
    updateEngineSpecificContent(activeEngine);
    updateAvailability(activeEngine);
    updateLinks(activeEngine);

    if (updateUrl) {
      updateLocation(activeEngine);
    }

    try {
      window.localStorage.setItem(storageKey, activeEngine);
    } catch (error) {
      // The URL still preserves the explicit choice when storage is unavailable.
    }

    window.dispatchEvent(new CustomEvent('octoshaper-docs-engine-change', {
      detail: { engine: activeEngine, available: availability[activeEngine] }
    }));
  }

  function bindChoices() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-docs-engine-choice]'), function(choice) {
      if (choice.dataset.docsEngineBound === 'true') {
        return;
      }
      choice.dataset.docsEngineBound = 'true';
      choice.addEventListener('click', function() {
        setEngine(choice.dataset.docsEngineChoice, true);
      });
    });
    updateChoices(activeEngine);
  }

  function initialize() {
    activeEngine = getRequestedEngine();
    bindChoices();
    setEngine(activeEngine, false);
    observeLinks();
    window.addEventListener('octoshaper-sidebar-ready', function() {
      bindChoices();
      setEngine(activeEngine, false);
    });
    window.requestAnimationFrame(function() {
      updateAvailability(activeEngine);
      updateLinks(activeEngine);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
}());
