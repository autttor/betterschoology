/*
 * Fixture bootstrap.
 *
 * ORIGINAL code written for Better Schoology development. Captured Schoology
 * JavaScript is deliberately NOT shipped in fixtures: the bundles are
 * PowerSchool's, they expect production endpoints and server-generated
 * settings, and their failures would make the fixture environment unusable.
 *
 * What is reproduced is the part Better Schoology actually has to survive:
 *
 *  - a `Drupal.settings` object with the documented *shape* (never real values)
 *  - `Drupal.behaviors` and `Drupal.attachBehaviors`
 *  - the To Do fragment fetch + insert + attachBehaviors cycle that `s_home`
 *    performs, which is what makes a single DOMContentLoaded pass insufficient
 *
 * That last point is the reason this file exists: without it, the fixture would
 * be a static page and would never exercise the extension's MutationObserver,
 * idempotency markers or re-enhancement path.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var fixture = params.get('fixture') || 'default';

  // Shape only. Real captures carry CSRF, session and logout tokens under
  // `s_common`; none of that is reproduced, needed, or safe to reproduce.
  window.Drupal = window.Drupal || {};
  window.Drupal.settings = Object.assign(window.Drupal.settings || {}, {
    basePath: '/',
    s_common: {
      language: 'en',
      timezone: 'America/New_York',
      default_domain: 'app.schoology.com',
      user: { uid: '300001', school_nid: '400001' },
    },
    s_home: { reminders: 'enable', upcoming: 'enable', recentlyCompleted: 'defer' },
    s_edge: { feed_url: 'home', update_max_comments_show: 3, update_max_comments_ajax: 10 },
    s_edge_filter: { realm: 'user', url: '/home/feed?page=0' },
  });

  window.Drupal.behaviors = window.Drupal.behaviors || {};

  /** Runs every registered behavior over a context, exactly as Schoology does. */
  window.Drupal.attachBehaviors = function (context) {
    var scope = context || document;
    for (var name in window.Drupal.behaviors) {
      if (!Object.prototype.hasOwnProperty.call(window.Drupal.behaviors, name)) continue;
      try {
        window.Drupal.behaviors[name](scope);
      } catch (error) {
        console.warn('[fixture] behavior failed:', name, error);
      }
    }
  };

  /**
   * A stand-in for `sEventUpcoming`, the native behavior that marks To Do rows
   * as processed. Better Schoology must never strip these markers, so the
   * fixture creates them.
   */
  window.Drupal.behaviors.sEventUpcoming = function (context) {
    var rows = (context || document).querySelectorAll('.upcoming-event:not(.sEventUpcoming-processed)');
    for (var i = 0; i < rows.length; i++) rows[i].classList.add('sEventUpcoming-processed');
  };

  /**
   * Reproduces `s_home`'s deferred To Do load.
   *
   * The native module requests the fragment endpoints, inserts the returned
   * `html` and calls `attachBehaviors` on it. Re-running that here means the
   * page mutates after load, the way real Schoology does.
   */
  function loadTodoFragment(endpoint, wrapperSelector) {
    var wrapper = document.querySelector(wrapperSelector);
    if (!wrapper) return;

    var url = endpoint + (fixture !== 'default' ? '?fixture=' + encodeURIComponent(fixture) : '');

    fetch(url, { credentials: 'same-origin' })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (payload) {
        if (!payload || typeof payload.html !== 'string' || !payload.html) return;

        var list = wrapper.querySelector('.upcoming-list');
        if (!list) return;

        var parsed = document.createElement('div');
        parsed.innerHTML = payload.html;
        var incoming = parsed.querySelector('.upcoming-list') || parsed;

        list.innerHTML = incoming.innerHTML;
        window.Drupal.attachBehaviors(list);
        document.dispatchEvent(new CustomEvent('fixture:todo-loaded', { detail: { endpoint: endpoint } }));
      })
      .catch(function (error) {
        console.warn('[fixture] fragment failed:', endpoint, error);
      });
  }

  function start() {
    window.Drupal.attachBehaviors(document);

    // Deferred, so the extension's first pass genuinely happens before the
    // fragments land -- the ordering that makes idempotency matter.
    window.setTimeout(function () {
      loadTodoFragment('/home/overdue_submissions_ajax', '.overdue-submissions-wrapper');
      loadTodoFragment('/home/upcoming_submissions_ajax', '.upcoming-submissions-wrapper');
    }, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
