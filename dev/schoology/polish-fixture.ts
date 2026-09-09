import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'cheerio';

/** Opt-in synthetic contract. Captured pages stay unchanged without ?polish=1. */
export function applyPolishFixture(html: string): string {
  const $ = load(html);
  const contract = load(readFileSync(resolve(import.meta.dirname,
    '../../tests/fixtures/schoology/fragments/navigation-polish.html'), 'utf8'));
  $('#header').replaceWith(contract('#header').toString());
  $('#site-navigation-footer').replaceWith(contract('#site-navigation-footer').toString());
  $('#todo, #todo aside, #todo .upcoming-list').attr('style', 'background: white');
  // Synthetic words in the observed comment cell structure. No grading date is invented.
  const scored = $('.item-row').filter((_index, row) => $(row).find('.rounded-grade').length > 0).first();
  scored.find('.comment-column .td-content-wrapper').text('Good work on the explanation. Add one example next time.');
  $('body').append(`<script>
    document.querySelector('[aria-controls="fixture-courses-menu"]').addEventListener('click', function () {
      const expanded = this.getAttribute('aria-expanded') !== 'true';
      this.setAttribute('aria-expanded', String(expanded));
      document.getElementById('fixture-courses-menu').hidden = !expanded;
    });
  </script>`);
  return $.html();
}
