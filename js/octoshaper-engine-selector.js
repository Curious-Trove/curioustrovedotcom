(function () {
  var choices = Array.prototype.slice.call(document.querySelectorAll('[data-engine-choice]'));
  var storageKey = 'octoshaper-engine-edition';
  var changeTimer;

  if (!choices.length) {
    return;
  }

  var editions = {
    unity: {
      headline: 'Node-based procedural generation for Unity',
      intro: 'Build, preview, and run graph-driven systems directly in your Unity project.',
      perks: ['No subscription', 'One-time purchase', 'Indie friendly'],
      useCasesTitle: 'What you can build',
      bottomTitle: 'Ready to try it in your Unity project?',
      bottomCopy: 'One-time purchase. Lifetime license. No subscription.'
    },
    godot: {
      headline: 'Node-based procedural generation for Godot',
      intro: 'Build, preview, and run graph-driven systems directly in your Godot project.',
      perks: ['No subscription', 'One-time purchase', 'Indie friendly'],
      useCasesTitle: 'What you will be able to build with Godot',
      bottomTitle: 'Interested in OctoShaper for Godot?',
      bottomCopy: 'Follow the development and be first to hear when the Godot edition is ready.'
    }
  };

  function element(id) {
    return document.getElementById(id);
  }

  function text(id, value) {
    var target = element(id);
    if (target) {
      target.textContent = value;
    }
  }

  function visible(id, show) {
    var target = element(id);
    if (target) {
      target.classList.toggle('hidden', !show);
    }
  }

  function setChanging(changing) {
    ['engine-copy-panel', 'engine-action-panel'].forEach(function (id) {
      var panel = element(id);
      if (panel) {
        panel.classList.toggle('is-changing', changing);
      }
    });
  }

  function render(engine, animate) {
    var edition = editions[engine] || editions.unity;
    var godot = engine === 'godot';

    if (animate) {
      window.clearTimeout(changeTimer);
      setChanging(true);
    }

    changeTimer = window.setTimeout(function () {
      document.body.dataset.engine = engine;
      text('engine-headline', edition.headline);
      text('engine-intro', edition.intro);
      text('engine-perk-one', edition.perks[0]);
      text('engine-perk-two', edition.perks[1]);
      text('engine-perk-three', edition.perks[2]);
      text('engine-use-cases-title', edition.useCasesTitle);
      text('engine-bottom-title', edition.bottomTitle);
      text('engine-bottom-copy', edition.bottomCopy);

      visible('engine-unity-action', !godot);
      visible('engine-godot-action', godot);
      visible('engine-unity-graph-preview', !godot);
      visible('engine-godot-graph-preview', godot);
      visible('engine-bottom-unity-action', !godot);
      visible('engine-bottom-godot-action', godot);
      Array.prototype.forEach.call(document.querySelectorAll('[data-unity-only]'), function (target) {
        target.classList.toggle('hidden', godot);
      });

      choices.forEach(function (choice) {
        var current = choice.dataset.engineChoice === engine;
        if (current) {
          choice.setAttribute('aria-current', 'page');
        } else {
          choice.removeAttribute('aria-current');
        }
        if (choice.tagName === 'BUTTON') {
          choice.setAttribute('aria-pressed', String(current));
        }
      });

      try {
        window.localStorage.setItem(storageKey, engine);
      } catch (error) {}
      setChanging(false);
    }, animate ? 120 : 0);
  }

  choices.forEach(function (choice) {
    choice.addEventListener('click', function () {
      var engine = choice.dataset.engineChoice;
      if (window.umami) {
        window.umami.track('Engine Edition Selected', { engine: engine });
      }
      if (choice.tagName === 'A') {
        try {
          window.localStorage.setItem(storageKey, engine);
        } catch (error) {}
        return;
      }
      render(engine, true);
    });
  });

  // Each engine route is pre-rendered by scripts/build-site.mjs, so the initial
  // state is already correct; render() only runs for in-page (button) toggles.
}());
