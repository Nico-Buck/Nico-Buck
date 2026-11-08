// Renders the GitHub contribution calendar as light and dark SVGs.
// Usage: GITHUB_TOKEN=... node scripts/contributions.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const LOGIN = 'Alonezdb';
const OUT_DIR = 'assets';
const MIN_WEEKS = 26;

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];

const THEMES = {
  dark: {
    text: '#8b949e',
    strong: '#e6edf3',
    ramp: ['#21262d', '#5c3526', '#8f4e36', '#c46a49', '#ee9673'],
  },
  light: {
    text: '#57606a',
    strong: '#1f2328',
    ramp: ['#eff2f5', '#f5cdbb', '#e8a084', '#d0704d', '#a34a2b'],
  },
};

async function fetchCalendar(token) {
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount contributionLevel } }
        }
      }
    }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const { data, errors } = await res.json();
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  return data.user.contributionsCollection.contributionCalendar;
}

// Drops the empty weeks before the first contribution so a young account
// doesn't render as a mostly blank year.
function visibleWeeks(weeks) {
  const firstActive = weeks.findIndex((w) => w.contributionDays.some((d) => d.contributionCount > 0));
  if (firstActive === -1) return weeks.slice(-MIN_WEEKS);
  return weeks.slice(Math.max(0, Math.min(firstActive - 1, weeks.length - MIN_WEEKS)));
}

function monthLabels(weeks) {
  const labels = [];
  weeks.forEach((week, x) => {
    const month = new Date(`${week.contributionDays[0].date}T00:00:00Z`).getUTCMonth();
    if (x === 0 || month !== labels.at(-1).month) labels.push({ x, month });
  });
  // A first label squeezed against the next one would overlap it.
  if (labels.length > 1 && labels[1].x - labels[0].x < 3) labels.shift();
  return labels;
}

export function render(calendar, theme) {
  const { text, strong, ramp } = THEMES[theme];
  const weeks = visibleWeeks(calendar.weeks);
  const pitch = Math.min(22, Math.floor(742 / weeks.length));
  const cell = pitch - 3;
  const radius = Math.max(2, Math.round(cell / 5));
  const left = 34;
  const top = 58;
  const gridHeight = pitch * 7 - 3;
  const width = left + pitch * weeks.length - 3;
  const height = top + gridHeight + 34;

  const months = monthLabels(weeks)
    .map(({ x, month }) => `<text x="${left + x * pitch}" y="${top - 10}">${MONTHS[month]}</text>`)
    .join('');

  const days = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]
    .map(([y, label]) => `<text x="0" y="${top + y * pitch + cell / 2 + 4}">${label}</text>`)
    .join('');

  const columns = weeks
    .map((week, x) => {
      const rects = week.contributionDays
        .map((day) => {
          const y = new Date(`${day.date}T00:00:00Z`).getUTCDay();
          const fill = ramp[Math.max(0, LEVELS.indexOf(day.contributionLevel))];
          return `<rect x="${left + x * pitch}" y="${top + y * pitch}" width="${cell}" height="${cell}" rx="${radius}" fill="${fill}"/>`;
        })
        .join('');
      return `<g class="w" style="animation-delay:${x * 18}ms">${rects}</g>`;
    })
    .join('');

  const swatchX = width - 5 * 15 - 38;
  const legendY = top + gridHeight + 16;
  const legend = ramp
    .map((fill, i) => `<rect x="${swatchX + i * 15}" y="${legendY}" width="12" height="12" rx="2" fill="${fill}"/>`)
    .join('');

  const total = calendar.totalContributions.toLocaleString('en-US');
  const noun = calendar.totalContributions === 1 ? 'contribution' : 'contributions';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${total} ${noun} in the last year">
<style>
text{font:12px ${FONT};fill:${text}}
.t{font-size:15px;font-weight:600;fill:${strong}}
.w{animation:f .5s ease-out both}
@keyframes f{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.w{animation:none}}
</style>
<text class="t" x="0" y="18">${total} ${noun} in the last year</text>
${months}${days}${columns}
<text x="${swatchX - 8}" y="${legendY + 10}" text-anchor="end">Less</text>${legend}<text x="${width}" y="${legendY + 10}" text-anchor="end">More</text>
</svg>
`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const calendar = await fetchCalendar(token);
  await mkdir(OUT_DIR, { recursive: true });
  for (const theme of Object.keys(THEMES)) {
    await writeFile(`${OUT_DIR}/contributions-${theme}.svg`, render(calendar, theme));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
