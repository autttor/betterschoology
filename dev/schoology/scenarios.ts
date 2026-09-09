import * as cheerio from 'cheerio';

/**
 * Deterministic fixture scenarios.
 *
 * Selected with `?fixture=<name>` on any page, e.g. `/home?fixture=overdue`.
 * One mechanism, applied consistently, rather than a parallel `/__fixtures/...`
 * route space -- the address bar keeps real Schoology paths, which is the whole
 * point of serving fixtures over HTTP.
 *
 * Scenarios only ever *transform* the sanitized capture. Nothing here invents
 * Schoology markup that the capture did not demonstrate.
 */
export type ScenarioName =
  | 'default'
  | 'empty'
  | 'many-tasks'
  | 'overdue'
  | 'no-image'
  | 'long-name'
  | 'ungraded'
  | 'weighted';

export const SCENARIOS: Array<{ name: ScenarioName; description: string }> = [
  { name: 'default', description: 'The capture as-is' },
  { name: 'empty', description: 'No To Do items, no grades, empty lists' },
  { name: 'many-tasks', description: 'To Do rows duplicated to 40+ items' },
  { name: 'overdue', description: 'Every To Do row moved into the overdue block' },
  { name: 'no-image', description: 'All images removed' },
  { name: 'long-name', description: 'Course names replaced with a very long one' },
  { name: 'ungraded', description: 'All grade values replaced with the ungraded state' },
  {
    name: 'weighted',
    description: 'Category rows given weights, using the markup period rows already carry',
  },
];

/**
 * Weights for the `weighted` scenario.
 *
 * The capture's own courses are point-based: its category rows carry no
 * `.percentage-contrib`. Its *period* rows do, so the markup and its meaning
 * are both demonstrated by the capture -- this scenario moves that same span
 * onto category rows so the weighted code path can be exercised. It is a
 * transform of demonstrated markup, not invented DOM architecture.
 */
const CATEGORY_WEIGHTS = [40, 30, 20, 10];

const LONG_COURSE_NAME =
  'Example Advanced Interdisciplinary Research Seminar and Capstone Workshop for Graduating Students';

export function isScenario(value: string | null): value is ScenarioName {
  return SCENARIOS.some((scenario) => scenario.name === value);
}

/**
 * Applies a scenario to a fixture's HTML.
 *
 * `fragment` must be set for endpoint payloads: those are bare markup, and
 * parsing them as a document would wrap them in `<html><body>` and change the
 * response shape the extension sees.
 */
export function applyScenario(html: string, scenario: ScenarioName, fragment = false): string {
  if (scenario === 'default' || !html.trim()) return html;

  const $ = fragment ? cheerio.load(html, null, false) : cheerio.load(html);

  switch (scenario) {
    case 'empty': {
      $('.upcoming-list').empty().append('<div class="empty">No upcoming assignments</div>');
      $('ul.s-edge-feed').empty();
      $('.report-row').not('.course-row').remove();
      $('#folder-contents-table tbody').empty();
      $('.fc-event').remove();
      break;
    }

    case 'many-tasks': {
      // Duplicating real rows keeps the markup honest while exercising the
      // "far more items than Schoology displays" case.
      $('.upcoming-list').each((_, list) => {
        const rows = $(list).find('.upcoming-event').toArray();
        if (rows.length === 0) return;
        for (let round = 0; round < 3; round++) {
          for (const row of rows) $(list).append($(row).clone());
        }
      });
      break;
    }

    case 'overdue': {
      const overdueList = $('.overdue-submissions-wrapper .upcoming-list').first();
      const upcomingRows = $('.upcoming-submissions-wrapper .upcoming-event');
      if (overdueList.length > 0) {
        upcomingRows.each((_, row) => {
          overdueList.append($(row).clone());
        });
      }
      $('.upcoming-submissions-wrapper .upcoming-event').remove();
      break;
    }

    case 'no-image': {
      $('img').remove();
      break;
    }

    case 'long-name': {
      for (const selector of ['.gradebook-course-title a', '#center-top .course-title a', '#center-top h1.page-title a']) {
        $(selector).each((_, node) => {
          const el = $(node);
          const hidden = el.find('.visually-hidden').clone();
          el.text(LONG_COURSE_NAME);
          if (hidden.length) el.append(hidden);
        });
      }
      break;
    }

    case 'ungraded': {
      $('.grade-column .td-content-wrapper').html('<span class="no-grade">&mdash;</span>');
      $('.received-grade').text('--');
      break;
    }

    case 'weighted': {
      // One weight cycle per report, so each course's categories sum to 100%.
      $('.hierarchical-grading-report').each((_, report) => {
        $(report)
          .find('tr.category-row')
          .each((index, row) => {
            const title = $(row).find('.title-column .title').first();
            if (title.length === 0 || $(row).find('.percentage-contrib').length > 0) return;
            const weight = CATEGORY_WEIGHTS[index % CATEGORY_WEIGHTS.length];
            title.after(` <span class="percentage-contrib">(${weight}%)</span>`);
          });
      });
      break;
    }
  }

  return $.html();
}
