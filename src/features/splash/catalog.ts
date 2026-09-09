import source from './source.md?raw';
import type { AcademicPeriod, Splash, SplashCategory, SplashHoliday, SplashRequirement } from './types';

const CATEGORIES: readonly SplashCategory[] = [
  'Contextual and General', 'Time of Day', 'Due Dates and Urgency', 'Tabs and Browser',
  'Grades and GPA', 'Day of Week', 'Holidays and School Year', 'Easter Eggs and Funny',
];

function unsupported(reason: string): SplashRequirement {
  return { kind: 'unsupported', reason };
}

/**
 * The source is kept verbatim. Numbered metadata groups are editorial annotations,
 * not rewritten jokes or invented app capabilities. Unknown state is ineligible.
 */
function requirementsFor(number: number, text: string, category: SplashCategory): SplashRequirement[] {
  const requirements: SplashRequirement[] = [];
  const add = (...items: SplashRequirement[]): void => { requirements.push(...items); };
  const due = (timing: Extract<SplashRequirement, { kind: 'due' }>['timing']): void => add({ kind: 'due', timing });
  const academic = (period: AcademicPeriod): void => add({ kind: 'academic-period', period });

  // Grade references also occur in General, Time of Day and Easter Eggs.
  if (/grade|gpa|teacher (?:comment|feedback)|gradebook|category weights|point value|points|score|weights/i.test(text)) {
    add({ kind: 'grade-context' });
  }
  if (/read the (?:teacher )?comment|check the comments on your last assignment/i.test(text)) add({ kind: 'feedback' });

  if (category === 'Contextual and General') {
    if (/actually due soon/.test(text)) due('soon');
    if (/assignment|due first|due soon|due next|due date|next deadline|shortest task|easiest thing|list shorter|one of these|pick a task|urgent|finish.*task|finish.*thing|finish.*one/i.test(text)) add({ kind: 'tasks' });
    if (/clear one overdue/.test(text)) due('overdue');
    if (/red badge|draft|discussion post|already done|already finished|finished one|finished last night/.test(text)) {
      add(unsupported('Draft, completion, discussion and native badge state are not available.'));
    }
    if (/close (?:two|a couple) tabs/.test(text)) add({ kind: 'tab-count', count: 2, comparison: 'at-least' });
  }

  if (category === 'Time of Day') {
    add({ kind: 'time', period: number <= 247 ? 'morning' : number <= 261 ? 'afternoon' : 'evening' });
    if ([234, 242].includes(number)) add({ kind: 'time', period: 'early-morning' });
    if (number === 268) {
      // Late night includes the hours after midnight, unlike a normal evening.
      requirements.splice(requirements.findIndex((item) => item.kind === 'time'), 1);
      add({ kind: 'time', period: 'late-night' });
    }
    if (number === 235 || (number >= 243 && number <= 247)) add(unsupported('Breakfast and first-period schedules are not known.'));
    if ([264, 267].includes(number)) due('midnight');
    if (number === 271) add(unsupported('The next assignment point value and start time are not known.'));
    if (/finish|assignment|shortest thing|less to do|one last/i.test(text)) add({ kind: 'tasks' });
  }

  if (category === 'Due Dates and Urgency') {
    const minute = text.match(/\b(\d+) minutes?\b/);
    const hour = text.match(/\b(\d+) hours?\b/);
    if (minute) add({ kind: 'deadline-minutes', minutes: Number(minute[1]) });
    else if (hour) add({ kind: 'deadline-minutes', minutes: Number(hour[1]) * 60 });
    else if (number === 279) add({ kind: 'deadline-minutes', minutes: 5 });
    else if (number === 298) add({ kind: 'deadline-minutes', minutes: 2 });
    else if (number === 299) add({ kind: 'deadline-minutes', minutes: 1 });
    else if (number === 283) add({ kind: 'deadline-minutes', minutes: 60 });
    else if (number === 278) {
      add({ kind: 'clock', hour: 23, minute: 54 });
      due('midnight');
    } else if (number === 284) due('tonight');
    else if (number === 285) due('tomorrow');
    else if ([286, 305].includes(number)) due('today');
    else if ([287, 289].includes(number)) due('overdue');
    else if (number === 288) due('overdue-yesterday');
    else if (number === 293) add(unsupported('Native red badge visibility is not known.'));
    else if ([295, 296, 297, 303, 306].includes(number)) due('midnight');
    else if ([290, 291, 292, 302].includes(number)) add({ kind: 'tasks' });
    else due('soon');
  }

  if (category === 'Tabs and Browser') {
    const count = text.match(/\b(\d+) tabs\b/);
    if (count) add({ kind: 'tab-count', count: Number(count[1]), comparison: 'exact' });
    else if ([399, 400, 402, 408, 415, 417, 418, 419, 420, 421].includes(number)) {
      // Suggestions and general jokes make no claim about the browser's actual state.
    } else if ([409, 410, 411, 423].includes(number)) add({ kind: 'tab-count', count: 12, comparison: 'at-least' });
    else add(unsupported('Tab age, content, audio, hardware state and keyboard platform are not observed.'));
  }

  if (category === 'Grades and GPA') {
    add({ kind: 'grade-context' });
    if ([464, 465].includes(number)) add({ kind: 'grade-changed' });
    if ([475, 476, 493, 499].includes(number)) add({ kind: 'feedback' });
    if ([466, 467, 468, 469, 470, 478, 481, 482, 483, 484, 485, 486, 487, 488, 490, 491, 496].includes(number)) {
      add(unsupported('Grade quality, trends, ungraded state and what-if calculator availability are not established.'));
    }
  }

  if (category === 'Day of Week') {
    // Seven groups of ten lines, Monday through Sunday, including indirect wording.
    add({ kind: 'weekday', day: (Math.floor((number - 502) / 10) + 1) % 7 });
    if (/homework|finish|submit|one thing|off the list|all of this/i.test(text)) add({ kind: 'tasks' });
  }

  if (category === 'Holidays and School Year') {
    const holidays: Array<[number, number, SplashHoliday]> = [
      [572, 575, 'new-year'], [576, 579, 'valentine'], [580, 583, 'pi-day'],
      [584, 587, 'april-fools'], [588, 591, 'halloween'], [592, 595, 'thanksgiving'],
      [596, 598, 'winter-holidays'],
    ];
    for (const [first, last, holiday] of holidays) {
      if (number >= first && number <= last) add({ kind: 'holiday', holiday });
    }
    if (number === 575) add(unsupported('The first login of the year is not tracked.'));
    if (number === 577) add(unsupported('Native red badge visibility is not known.'));
    if ([578, 582, 583, 584, 589, 591].includes(number)) add({ kind: 'tasks' });
    if (number === 590) due('overdue');
    if (number === 599 || number >= 654) academic('before-break');
    if ([600, 603, 604, 605].includes(number) || (number >= 622 && number <= 629)) academic('first-week');
    if (number === 601) academic('semester-start');
    if (number === 602) academic('first-day');
    if ([606, 607].includes(number) || (number >= 630 && number <= 637)) academic('midterms');
    if ([608, 609].includes(number) || (number >= 638 && number <= 645)) academic('finals');
    if (number === 610) academic('finals-ending');
    if (number === 611 || (number >= 646 && number <= 653)) academic('last-week');
    if (number >= 612 && number <= 616) academic('last-day');
    if (number === 616) add(unsupported('An empty fetched task panel does not prove that no future due dates exist.'));
    if (number >= 617 && number <= 619) academic('graduation');
    if (number === 620) academic('summer-start');
    if (number === 621) academic('summer-break');
  }

  if (category === 'Easter Eggs and Funny') {
    if (number === 671) due('soon');
    if ([672, 673, 674, 675, 676, 680, 693, 694, 695, 700, 701, 702, 703, 704, 710, 713, 724].includes(number)) {
      add(unsupported('This line asserts an action, detail or customization that the splash context cannot verify.'));
    }
    if ([677, 681, 682, 683, 684, 685, 686, 735].includes(number)) add({ kind: 'tasks' });
    if (number === 691) add({ kind: 'weekday', day: -1 }); // Monday to Friday, resolved by eligibility.
    if (number === 721) add(unsupported('A grade surface does not prove the student clicked Grades.'));
    if (number === 729) add({ kind: 'tab-count', count: 40, comparison: 'exact' });
  }

  return requirements;
}

/** Parses only the eight content sections. Style rules are source documentation, never code. */
export function parseSplashMarkdown(markdown: string): Splash[] {
  const result: Splash[] = [];
  let category: SplashCategory | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/)?.[1];
    if (heading) category = CATEGORIES.find((candidate) => candidate === heading);
    const numbered = line.match(/^(\d+)\. (.+)$/);
    if (!category || !numbered?.[1] || !numbered[2]) continue;
    const number = Number(numbered[1]);
    const text = numbered[2];
    const requirements = requirementsFor(number, text, category);
    result.push({
      id: `splash-${number}`, number, text, category, requirements,
      bucket: category === 'Easter Eggs and Funny' ? 'easter-egg' : requirements.length ? 'contextual' : 'general',
    });
  }
  return result;
}

export const SPLASHES: readonly Splash[] = parseSplashMarkdown(source);
