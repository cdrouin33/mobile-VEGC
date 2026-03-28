
(function(){
const DATA_FILE = 'league-data.json';
const STORAGE_KEY = 'mensLeagueAdminData_v7';
const SESSION_KEY = 'mensLeagueAdminUnlocked_v7';
const BACKUP_KEY = 'mensLeagueAdminWeekBackups_v1';
const SEASON_BACKUP_KEY = 'mensLeagueSeasonResetBackup_v1';

const WEEK_DEFS = [
  ['W1','2026-05-05','Preseason', false, false],
  ['W2','2026-05-12','Preseason', false, false],
  ['W3','2026-05-19','Preseason', false, false],
  ['W4','2026-05-26','Segment 1', true, true],
  ['W5','2026-06-02','Segment 1', true, true],
  ['W6','2026-06-09','Segment 1', true, true],
  ['W7','2026-06-16','Segment 1', true, true],
  ['W8','2026-06-23','Segment 2', true, true],
  ['W9','2026-06-30','Segment 2', true, true],
  ['W10','2026-07-07','Segment 2', true, true],
  ['W11','2026-07-14','Segment 2', true, true],
  ['W12','2026-07-21','Segment 3', true, true],
  ['W13','2026-07-28','Segment 3', true, true],
  ['W14','2026-08-04','Segment 3', true, true],
  ['W15','2026-08-11','Segment 3', true, true],
  ['W16','2026-08-18','Segment 4', true, true],
  ['W17','2026-08-25','Segment 4', true, true],
  ['W18','2026-09-01','Segment 4', true, true],
  ['W19','2026-09-08','Segment 4', true, true]
];
const SEGMENTS = ['Segment 1', 'Segment 2', 'Segment 3', 'Segment 4'];

const defaultData = {
  settings: {
    leagueName: '2026 Mens Night League',
    courseName: 'Vegreville Kinsmen Golf Club',
    adminPassword: 'mens2026',
    weeklyPayoutPerPlayer: 7.5,
    kpPerPlayer: 2.5,
    segmentPerPlayer: 5,
    weeklySplit: [0.45, 0.30, 0.25],
    segmentSplit: [0.5, 0.3, 0.2],
    yearEndSplit: [0.4, 0.3, 0.2, 0.1],
    squareSegmentPct: 0.5,
    squareYearEndPct: 0.5,
    maxHandicap: 6,
    maxIncreasePerWeek: 2
  },
  teams: Array.from({length: 12}, (_, i) => ({ id: `T${i+1}`, name: `Team ${i+1}`, players: ['', '', '', ''] })),
  weeks: WEEK_DEFS.map(args => makeWeek(...args))
};

function makeWeek(id, date, segment, officialSeason, dropLowestEligible){
  return {
    id, date, segment, officialSeason, dropLowestEligible,
    attendancePlayers: 0,
    weeklyExtraMoney: 0,
    segmentExtraMoney: 0,
    yearEndCollected: 0,
    yearEndExtraMoney: 0,
    squareRevenue: 0,
    squarePrizeCost: 0,
    kpWon: false,
    kpWinner: '',
    notes: '',
    pairingsPublished: false,
    publishedAt: '',
    scores: {},
    pairings: Array.from({length: 6}, (_, i) => ({ slot: i + 1, teamA: '', teamB: '' }))
  };
}

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function round2(n){ return Math.round((Number(n) || 0) * 100) / 100; }
function parseNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : NaN; }
function money(n){ return `$${round2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(d){ return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function escapeHTML(s){ return String(s ?? '').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
function escapeAttr(s){ return escapeHTML(s).replace(/'/g, '&#39;'); }
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function avg(nums){ return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0; }
function teamHasIdentity(team){ return !!String(team?.name || '').trim(); }
function activeTeams(data){ return data.teams.filter(teamHasIdentity); }
function teamNameMap(data){ return Object.fromEntries(data.teams.map(t => [t.id, t.name || t.id])); }
function teamHasPlayed(data, teamId){ return data.weeks.some(w => Number.isFinite(parseNumber(w.scores?.[teamId]))); }
function playedTeams(data){ return activeTeams(data).filter(team => teamHasPlayed(data, team.id)); }
function setPath(obj, path, value){
  const parts = path.split('.');
  let ref = obj;
  for (let i = 0; i < parts.length - 1; i++) ref = ref[isFinite(parts[i]) ? Number(parts[i]) : parts[i]];
  ref[isFinite(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : parts[parts.length - 1]] = value;
}

function normalizeData(source){
  const data = clone(defaultData);
  if (source?.settings) data.settings = { ...data.settings, ...source.settings };
  if (Array.isArray(source?.teams)) {
    data.teams = source.teams.map((team, idx) => ({
      id: team.id || `T${idx+1}`,
      name: team.name || `Team ${idx+1}`,
      players: Array.isArray(team.players) ? [...team.players, '', '', '', ''].slice(0,4) : ['', '', '', '']
    }));
  }
  if (!data.teams.length) data.teams = clone(defaultData.teams);

  const incomingById = Object.fromEntries((source?.weeks || []).map(w => [w.id, w]));
  data.weeks = WEEK_DEFS.map(def => {
    const [id, date, segment, officialSeason, dropLowestEligible] = def;
    const base = makeWeek(id, date, segment, officialSeason, dropLowestEligible);
    const incoming = incomingById[id] || {};
    const pairings = Array.isArray(incoming.pairings) ? incoming.pairings : base.pairings;
    return {
      ...base,
      ...incoming,
      id,
      date,
      segment,
      officialSeason,
      dropLowestEligible,
      attendancePlayers: finiteOrZero(incoming.attendancePlayers),
      weeklyExtraMoney: finiteOrZero(incoming.weeklyExtraMoney),
      segmentExtraMoney: finiteOrZero(incoming.segmentExtraMoney || incoming.sponsorSegment),
      yearEndCollected: finiteOrZero(incoming.yearEndCollected),
      yearEndExtraMoney: finiteOrZero(incoming.yearEndExtraMoney || incoming.sponsorYearEnd),
      squareRevenue: finiteOrZero(incoming.squareRevenue),
      squarePrizeCost: finiteOrZero(incoming.squarePrizeCost),
      kpWon: !!incoming.kpWon,
      kpWinner: incoming.kpWinner || '',
      notes: incoming.notes || '',
      pairingsPublished: !!incoming.pairingsPublished,
      publishedAt: incoming.publishedAt || '',
      scores: incoming.scores || {},
      pairings: Array.from({length: 6}, (_, i) => ({
        slot: i + 1,
        teamA: pairings[i]?.teamA || '',
        teamB: pairings[i]?.teamB || ''
      }))
    };
  });
  return data;
}

function finiteOrZero(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }

async function loadData(useLocal){
  if (useLocal) {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      try { return normalizeData(JSON.parse(local)); } catch {}
    }
  }
  try {
    const res = await fetch(DATA_FILE, { cache: 'no-store' });
    if (!res.ok) throw new Error('No JSON');
    const json = await res.json();
    return normalizeData(json);
  } catch {
    return normalizeData(defaultData);
  }
}

function saveLocal(data){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2)); }

function loadBackups(){
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '{}'); } catch { return {}; }
}
function saveBackups(backups){ localStorage.setItem(BACKUP_KEY, JSON.stringify(backups)); }
function snapshotWeek(data, weekIndex, label='Manual save'){
  const week = clone(data.weeks[weekIndex]);
  const backups = loadBackups();
  const list = Array.isArray(backups[week.id]) ? backups[week.id] : [];
  list.unshift({
    label,
    savedAt: new Date().toISOString(),
    week
  });
  backups[week.id] = list.slice(0, 12);
  saveBackups(backups);
  return backups[week.id].length;
}
function restoreWeekSnapshot(data, weekIndex, snapshotIndex=0){
  const week = data.weeks[weekIndex];
  const backups = loadBackups();
  const list = Array.isArray(backups[week.id]) ? backups[week.id] : [];
  if (!list[snapshotIndex]?.week) return false;
  data.weeks[weekIndex] = normalizeData({ ...data, weeks: data.weeks.map((w, idx) => idx === weekIndex ? list[snapshotIndex].week : w) }).weeks[weekIndex];
  saveLocal(data);
  return true;
}
function weekBackupsFor(weekId){
  const backups = loadBackups();
  return Array.isArray(backups[weekId]) ? backups[weekId] : [];
}

function weekStatus(week){
  const hasPairings = Array.isArray(week.pairings) && week.pairings.some(p => p.teamA || p.teamB);
  const hasPublished = !!week.pairingsPublished;
  const hasScores = Object.values(week.scores || {}).some(v => Number.isFinite(parseNumber(v)));
  const hasMoney = [week.attendancePlayers, week.weeklyExtraMoney, week.segmentExtraMoney, week.yearEndCollected, week.yearEndExtraMoney, week.squareRevenue, week.squarePrizeCost].some(v => finiteOrZero(v) !== 0);
  const hasNotes = !!String(week.kpWinner || week.notes || '').trim() || !!week.kpWon;
  if (hasScores) return { label: 'Completed', cls: 'status-complete' };
  if (hasMoney || hasNotes) return { label: 'Results Started', cls: 'status-live' };
  if (hasPublished) return { label: 'Pairings Posted', cls: 'status-posted' };
  if (hasPairings) return { label: 'Pairings Draft', cls: 'status-draft' };
  return { label: 'Not Started', cls: 'status-empty' };
}
function weekStatusBadge(week){
  const s = weekStatus(week);
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}
function saveSeasonResetBackup(data){
  localStorage.setItem(SEASON_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: clone(data) }));
}
function resetSeasonKeepTeams(data){
  saveSeasonResetBackup(data);
  data.weeks = WEEK_DEFS.map(args => makeWeek(...args));
  saveLocal(data);
}
function formatDateTime(iso){
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}
function currentWeekIndex(){
  const picker = document.getElementById('weekPicker');
  return picker ? (Number(picker.value) || 0) : 0;
}
function saveWithAutoBackup(data, status, label='Save'){
  const weekIndex = currentWeekIndex();
  snapshotWeek(data, weekIndex, label);
  saveLocal(data);
  status.textContent = `Saved locally and backed up ${data.weeks[weekIndex].id}.`;
}
function exportWithAutoBackup(data, status){
  const weekIndex = currentWeekIndex();
  snapshotWeek(data, weekIndex, 'Export');
  saveLocal(data);
  downloadData(data);
  status.textContent = `Exported league-data.json and backed up ${data.weeks[weekIndex].id}. Replace the live JSON file to publish.`;
}
function downloadData(data){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'league-data.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function calcLeague(data){
  const allTeams = activeTeams(data);
  const played = playedTeams(data);
  const teamNames = teamNameMap(data);
  const history = Object.fromEntries(allTeams.map(team => [team.id, {
    raws: [], handicapsApplied: [], preseasonPoints: 0, seasonGrossPoints: 0, seasonAdjustedPoints: 0,
    segmentWeeklyPoints: {}, playedWeeks: 0
  }]));

  let kpCarry = 0;
  let yearEndTotal = 0;
  const segmentFunds = { Preseason: 0, 'Segment 1': 0, 'Segment 2': 0, 'Segment 3': 0, 'Segment 4': 0 };
  const weeklyResults = [];

  for (let weekIndex = 0; weekIndex < data.weeks.length; weekIndex++) {
    const week = data.weeks[weekIndex];
    const scored = allTeams.map(team => {
      const gross = parseNumber(week.scores?.[team.id]);
      return Number.isFinite(gross) ? { teamId: team.id, teamName: team.name, gross } : null;
    }).filter(Boolean);

    const bestGross = scored.length ? Math.min(...scored.map(x => x.gross)) : null;
    const results = scored.map(item => {
      const prevApplied = history[item.teamId].handicapsApplied.at(-1) || 0;
      const priorRaws = history[item.teamId].raws;
      const target = priorRaws.length ? Math.round(avg(priorRaws)) : 0;
      const handicap = weekIndex === 0 || !priorRaws.length ? 0 : clamp(target > prevApplied ? Math.min(target, prevApplied + data.settings.maxIncreasePerWeek) : target, 0, data.settings.maxHandicap);
      const rawDiff = bestGross === null ? 0 : clamp(item.gross - bestGross, 0, data.settings.maxHandicap);
      return { ...item, handicap, net: item.gross - handicap, rawDiff, points: 0 };
    });

    awardPoints(results);

    results.forEach(r => {
      history[r.teamId].raws.push(r.rawDiff);
      history[r.teamId].handicapsApplied.push(r.handicap);
      history[r.teamId].playedWeeks += 1;
      if (week.officialSeason) {
        history[r.teamId].seasonGrossPoints += r.points;
        history[r.teamId].segmentWeeklyPoints[week.segment] = history[r.teamId].segmentWeeklyPoints[week.segment] || [];
        history[r.teamId].segmentWeeklyPoints[week.segment].push(r.points);
      } else {
        history[r.teamId].preseasonPoints += r.points;
      }
    });

    const players = finiteOrZero(week.attendancePlayers);
    const weeklyPool = players * data.settings.weeklyPayoutPerPlayer + finiteOrZero(week.weeklyExtraMoney);
    const kpPool = players * data.settings.kpPerPlayer;
    const segmentBase = players * data.settings.segmentPerPlayer + finiteOrZero(week.segmentExtraMoney);
    const squareLeftover = Math.max(0, finiteOrZero(week.squareRevenue) - finiteOrZero(week.squarePrizeCost));
    const segmentSquareAdd = squareLeftover * data.settings.squareSegmentPct;
    const yearEndSquareAdd = squareLeftover * data.settings.squareYearEndPct;
    const kpAvailable = kpCarry + kpPool;
    const kpPaid = week.kpWon ? kpAvailable : 0;
    kpCarry = week.kpWon ? 0 : kpAvailable;

    segmentFunds[week.segment] = (segmentFunds[week.segment] || 0) + segmentBase + segmentSquareAdd;
    yearEndTotal += finiteOrZero(week.yearEndCollected) + finiteOrZero(week.yearEndExtraMoney) + (week.officialSeason ? yearEndSquareAdd : 0);

    weeklyResults.push({
      weekId: week.id,
      date: week.date,
      segment: week.segment,
      officialSeason: week.officialSeason,
      players,
      results: results.sort((a,b)=> a.net - b.net || a.gross - b.gross || a.teamName.localeCompare(b.teamName)),
      payouts: { weeklyPool, kpPool, kpAvailable, kpPaid, kpCarryAfter: kpCarry, segmentBase, segmentSquareAdd, yearEndSquareAdd, yearEndCollected: finiteOrZero(week.yearEndCollected), yearEndExtraMoney: finiteOrZero(week.yearEndExtraMoney) },
      bestGross
    });
  }

  const preseasonStandings = played.filter(team => history[team.id].preseasonPoints > 0 || history[team.id].playedWeeks > 0)
    .map(team => ({ teamId: team.id, teamName: team.name, points: history[team.id].preseasonPoints }))
    .sort((a,b)=> b.points - a.points || a.teamName.localeCompare(b.teamName));
  rankStandings(preseasonStandings, 'points');

  const segmentStandings = {};
  SEGMENTS.forEach(segment => {
    const rows = played.filter(team => (history[team.id].segmentWeeklyPoints[segment] || []).length > 0)
      .map(team => {
        const weeks = (history[team.id].segmentWeeklyPoints[segment] || []).slice();
        const rawPoints = weeks.reduce((a,b)=>a+b,0);
        const droppedPoints = weeks.length === 4 ? Math.min(...weeks) : 0;
        const countedPoints = rawPoints - droppedPoints;
        history[team.id].seasonAdjustedPoints += countedPoints;
        return { teamId: team.id, teamName: team.name, weeks, rawPoints, droppedPoints, countedPoints, money: 0 };
      })
      .sort((a,b)=> b.countedPoints - a.countedPoints || b.rawPoints - a.rawPoints || a.teamName.localeCompare(b.teamName));
    rankStandings(rows, 'countedPoints');
    const splits = splitMoney(segmentFunds[segment] || 0, data.settings.segmentSplit);
    rows.forEach(row => { row.money = splits[(row.rank || 99) - 1] || 0; });
    segmentStandings[segment] = rows;
  });

  const seasonMoneyMap = Object.fromEntries(played.map(team => [team.id, 0]));
  Object.values(segmentStandings).forEach(rows => rows.forEach(row => { seasonMoneyMap[row.teamId] = (seasonMoneyMap[row.teamId] || 0) + row.money; }));
  const yearEndSplits = splitMoney(yearEndTotal, data.settings.yearEndSplit);

  const seasonStandings = played.filter(team => history[team.id].playedWeeks > 0)
    .map(team => ({
      teamId: team.id,
      teamName: team.name,
      points: history[team.id].seasonAdjustedPoints,
      grossPoints: history[team.id].seasonGrossPoints,
      currentHandicap: history[team.id].handicapsApplied.at(-1) || 0,
      money: seasonMoneyMap[team.id] || 0,
      yearEndMoney: 0
    }))
    .sort((a,b)=> b.points - a.points || b.grossPoints - a.grossPoints || a.teamName.localeCompare(b.teamName));
  rankStandings(seasonStandings, 'points');
  seasonStandings.forEach(row => {
    row.yearEndMoney = yearEndSplits[(row.rank || 99) - 1] || 0;
    row.money += row.yearEndMoney;
  });

  const latestCompletedWeek = [...weeklyResults].reverse().find(w => w.results.length) || null;
  const latestPublishedPairings = [...data.weeks].reverse().find(w => w.pairingsPublished && w.pairings.some(p => p.teamA || p.teamB)) || data.weeks.find(w => w.pairings.some(p => p.teamA || p.teamB)) || null;

  return {
    teamNames,
    playedTeams: played,
    history,
    weeklyResults,
    preseasonStandings,
    segmentStandings,
    seasonStandings,
    latestCompletedWeek,
    latestPublishedPairings,
    currentKpCarry: kpCarry,
    yearEndTotal,
    segmentFunds,
    activeTeamCount: allTeams.length
  };
}

function splitMoney(total, splits){ return splits.map(p => round2(total * p)); }
function rankStandings(rows, key){
  let rank = 0;
  let lastValue = null;
  rows.forEach((row, index) => {
    const value = row[key];
    if (value !== lastValue) rank = index + 1;
    row.rank = rank;
    lastValue = value;
  });
}
function awardPoints(results){
  if (!results.length) return;
  results.sort((a,b)=> a.net - b.net || a.gross - b.gross || a.teamName.localeCompare(b.teamName));
  const pointsScale = results.map((_, idx) => results.length - idx);
  let i = 0;
  while (i < results.length) {
    let j = i + 1;
    while (j < results.length && results[j].net === results[i].net && results[j].gross === results[i].gross) j++;
    const avgPoints = avg(pointsScale.slice(i, j));
    for (let k = i; k < j; k++) results[k].points = round2(avgPoints);
    i = j;
  }
}

function publicPage(data){
  const calc = calcLeague(data);
  document.getElementById('title').textContent = data.settings.leagueName;
  renderPayoutCards(data, calc);
  renderPairings(data, calc);
  renderWeeklyPayouts(data, calc);
  renderWeeklyTeamPayouts(data, calc);
  renderLatestLeaderboard(data, calc);
  renderPreseason(calc);
  renderSegments(calc);
  renderSeason(calc);
}

function renderPayoutCards(data, calc){
  const weeklySplit = splitMoney(calc.latestCompletedWeek?.payouts.weeklyPool || 0, data.settings.weeklySplit);
  const html = [
    payoutCard('Preseason', fmtDate(data.weeks[0].date) + ' – ' + fmtDate(data.weeks[2].date), [
      ['Weeks', '3'],
      ['Standings', calc.preseasonStandings.length ? `${calc.preseasonStandings.length} teams` : 'No rounds yet'],
      ['Drop score', 'No']
    ]),
    ...SEGMENTS.map(segment => payoutCard(segment, segmentRange(data, segment), [
      ['Current segment pot', money(calc.segmentFunds[segment] || 0)],
      ['Drop score', 'Lowest of 4'],
      ['Payout split', '50 / 30 / 20']
    ])),
    payoutCard('Year-End', 'Starts at $0 until real money is entered', [
      ['Current purse', money(calc.yearEndTotal)],
      ['Payout split', '40 / 30 / 20 / 10'],
      ['KP carry', money(calc.currentKpCarry)]
    ], 'quarter')
  ];
  document.getElementById('payoutBreakdowns').innerHTML = html.join('');
}
function payoutCard(title, subtitle, rows, cls='quarter'){
  return `<div class="card ${cls}"><div class="kicker">Payout Breakdown</div><h2>${title}</h2><p class="footer-note">${subtitle}</p><div class="mini-stack">${rows.map(([k,v]) => `<div class="money-row"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div></div>`;
}
function segmentRange(data, segment){
  const weeks = data.weeks.filter(w => w.segment === segment);
  return weeks.length ? `${fmtDate(weeks[0].date)} – ${fmtDate(weeks.at(-1).date)}` : '—';
}

function renderPairings(data, calc){
  const week = calc.latestPublishedPairings;
  const holder = document.getElementById('weeklyPairings');
  if (!week) {
    holder.innerHTML = `<div class="section-title-row"><div><div class="kicker">Weekly Pairings</div><h2>Pairings not published yet</h2></div></div><div class="empty-state">Use the admin page to generate and publish the upcoming week’s pairings.</div>`;
    return;
  }
  const rows = week.pairings.filter(p => p.teamA || p.teamB).map(p => `<div class="pairing-card"><div class="pairing-hole">Group ${p.slot}</div><div class="pairing-match">${escapeHTML(displayTeam(data, p.teamA))} <span class="dim">vs</span> ${escapeHTML(displayTeam(data, p.teamB))}</div></div>`).join('');
  holder.innerHTML = `
    <div class="section-title-row">
      <div>
        <div class="kicker">Weekly Pairings</div>
        <h2>${week.id} · ${fmtDate(week.date)} · <span class="badge">${week.segment}</span></h2>
      </div>
      <div class="stat-pills">
        <div class="stat-pill">Published ${week.publishedAt ? fmtDate(week.publishedAt) : 'ready'}</div><div class="stat-pill">Status ${weekStatus(week).label}</div>
        <div class="stat-pill">${week.pairings.filter(p => p.teamA || p.teamB).length} groups</div>
      </div>
    </div>
    ${rows ? `<div class="pairings-list">${rows}</div>` : `<div class="empty-state">No pairings entered for this week yet.</div>`}
    ${week.notes ? `<p class="footer-note">${escapeHTML(week.notes)}</p>` : ''}
  `;
}
function displayTeam(data, id){ return data.teams.find(t => t.id === id)?.name || 'TBD'; }

function renderWeeklyPayouts(data, calc){
  const holder = document.getElementById('weeklyPayouts');
  const latest = calc.latestCompletedWeek;
  if (!latest) {
    holder.innerHTML = `<div class="kicker">Weekly Payouts</div><h2>No weekly payouts yet</h2><div class="empty-state">Enter attendance, money, and scores in admin to show the weekly 1st, 2nd, 3rd, KP, and carryover details here.</div>`;
    return;
  }
  const weeklySplits = splitMoney(latest.payouts.weeklyPool, data.settings.weeklySplit);
  const weekData = data.weeks.find(w => w.id === latest.weekId) || {};
  const kpStatus = latest.payouts.kpPaid
    ? `${money(latest.payouts.kpPaid)} won by ${escapeHTML(weekData.kpWinner || 'winner')}`
    : `${money(latest.payouts.kpAvailable)} carries over`;
  holder.innerHTML = `
    <div class="section-title-row">
      <div>
        <div class="kicker">Weekly Payouts</div>
        <h2>${latest.weekId} · ${fmtDate(latest.date)}</h2>
      </div>
      <div class="stat-pills">
        <div class="stat-pill">Players ${latest.players}</div>
        <div class="stat-pill">Weekly pot ${money(latest.payouts.weeklyPool)}</div>
      </div>
    </div>
    <div class="mini-stack payout-breakdown-stack">
      <div class="money-row"><span>1st place</span><strong>${money(weeklySplits[0] || 0)}</strong></div>
      <div class="money-row"><span>2nd place</span><strong>${money(weeklySplits[1] || 0)}</strong></div>
      <div class="money-row"><span>3rd place</span><strong>${money(weeklySplits[2] || 0)}</strong></div>
      <div class="money-row"><span>KP</span><strong>${kpStatus}</strong></div>
      <div class="money-row"><span>Carryover after week</span><strong>${money(latest.payouts.kpCarryAfter)}</strong></div>
    </div>
    ${weekData.notes ? `<p class="footer-note">Weekly note: ${escapeHTML(weekData.notes)}</p>` : `<p class="footer-note">KP shows either the winner when claimed or the carryover amount when it rolls forward.</p>`}
  `;
}

function renderWeeklyTeamPayouts(data, calc){
  const holder = document.getElementById('weeklyTeamPayouts');
  const latest = calc.latestCompletedWeek;
  if (!latest) {
    holder.innerHTML = `<div class="kicker">Last Week Team Payouts</div><h2>No team payouts yet</h2><div class="empty-state">Once a week has real scores and attendance entered, the top weekly team payouts will appear here.</div>`;
    return;
  }
  const weeklySplits = splitMoney(latest.payouts.weeklyPool, data.settings.weeklySplit);
  const paidRows = latest.results.slice(0, 3).map((row, idx) => [idx + 1, row.teamName, row.net, row.points, money(weeklySplits[idx] || 0)]);
  holder.innerHTML = `
    <div class="section-title-row">
      <div>
        <div class="kicker">Last Week Team Payouts</div>
        <h2>${latest.weekId} · ${fmtDate(latest.date)}</h2>
      </div>
      <div class="stat-pills">
        <div class="stat-pill">Paid places ${paidRows.length}</div>
      </div>
    </div>
    ${paidRows.length ? tableHTML(['Place','Team','Net','Points','Payout'], paidRows) : '<div class="empty-state">No payout rows available for this week yet.</div>'}
    <p class="footer-note">Shows the team payouts from the latest completed week on the public page.</p>
  `;
}

function renderLatestLeaderboard(data, calc){
  const holder = document.getElementById('latestResults');
  const latest = calc.latestCompletedWeek;
  if (!latest) {
    holder.innerHTML = `<div class="kicker">Latest Weekly Leaderboard</div><h2>No scores entered yet</h2><div class="empty-state">Once you enter results from admin, the top 10 weekly leaderboard will appear here.</div>`;
    return;
  }
  const top = latest.results.slice(0, 10);
  const payouts = splitMoney(latest.payouts.weeklyPool, data.settings.weeklySplit);
  holder.innerHTML = `
    <div class="section-title-row">
      <div>
        <div class="kicker">Latest Weekly Leaderboard</div>
        <h2>${latest.weekId} · ${fmtDate(latest.date)}</h2>
      </div>
      <div class="stat-pills">
        <div class="stat-pill">Players ${latest.players}</div>
        <div class="stat-pill">Weekly pot ${money(latest.payouts.weeklyPool)}</div>
      </div>
    </div>
    ${tableHTML(['Rank','Team','Gross','Hdcp','Net','Points','Weekly $'], top.map((row, idx) => [
      idx + 1,
      row.teamName,
      row.gross,
      row.handicap,
      row.net,
      row.points,
      idx < 3 ? money(payouts[idx]) : '—'
    ]))}
    <p class="footer-note">Weekly team payouts are shown above, with KP ${latest.payouts.kpPaid ? `won by ${escapeHTML(data.weeks.find(w => w.id === latest.weekId)?.kpWinner || 'winner')}` : 'carried forward'}.</p>
  `;
}

function renderPreseason(calc){
  const holder = document.getElementById('preseason');
  holder.innerHTML = `<div class="kicker">Preseason Standings</div><h2>3 Week Warm-Up</h2>${calc.preseasonStandings.length ? tableHTML(['Rank','Team','Points'], calc.preseasonStandings.map(r => [r.rank, r.teamName, r.points])) : '<div class="empty-state">No preseason rounds entered yet.</div>'}`;
}

function renderSegments(calc){
  const holder = document.getElementById('segmentStandings');
  holder.innerHTML = `<div class="section-title-row"><div><div class="kicker">Segment Standings</div><h2>4 Equal 4-Week Segments</h2></div><div class="stat-pills"><div class="stat-pill">Lowest score dropped once each segment</div></div></div><div class="standings-wrap">${SEGMENTS.map(segment => {
    const rows = calc.segmentStandings[segment] || [];
    return `<div class="card"><h3>${segment}</h3><p class="footer-note">Current pot ${money(calc.segmentFunds[segment] || 0)}</p>${rows.length ? tableHTML(['Rank','Team','Raw','Dropped','Counted','Money'], rows.map(r => [r.rank, r.teamName, r.rawPoints, r.droppedPoints, r.countedPoints, money(r.money)])) : '<div class="empty-state">No rounds entered for this segment yet.</div>'}</div>`;
  }).join('')}</div>`;
}

function renderSeason(calc){
  const holder = document.getElementById('seasonStandings');
  holder.innerHTML = `<div class="section-title-row"><div><div class="kicker">Season Standings</div><h2>Official Season</h2></div><div class="stat-pills"><div class="stat-pill">Year-end purse ${money(calc.yearEndTotal)}</div><div class="stat-pill">Teams with rounds ${calc.playedTeams.length}</div></div></div>${calc.seasonStandings.length ? tableHTML(['Rank','Team','Points','Gross Pts','Hdcp','Segment + Year-End $'], calc.seasonStandings.map(r => [r.rank, r.teamName, r.points, r.grossPoints, r.currentHandicap, money(r.money)])) : '<div class="empty-state">Teams stay hidden until they have at least one round entered.</div>'}`;
}

function tableHTML(headers, rows){
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function adminPage(data, status){
  const calc = calcLeague(data);
  const app = document.getElementById('adminApp');
  app.innerHTML = `
    <div class="admin-grid">
      <div class="card col-7">
        <div class="section-title-row">
          <div>
            <div class="kicker">League Setup</div>
            <h2>Settings</h2>
          </div>
          <div class="actions-inline">
            <button id="saveLocalBtn">Save Local</button>
            <button id="exportBtn" class="gold">Export league-data.json</button>
            <label class="button secondary" for="importFile">Import JSON</label>
            <input id="importFile" type="file" accept="application/json" class="hidden">
          </div>
        </div>
        <div class="field-grid">
          ${inputField('League name', 'settings.leagueName', data.settings.leagueName)}
          ${inputField('Course name', 'settings.courseName', data.settings.courseName)}
          ${inputField('Admin password', 'settings.adminPassword', data.settings.adminPassword)}
          ${inputField('Weekly payout / player', 'settings.weeklyPayoutPerPlayer', data.settings.weeklyPayoutPerPlayer, 'number', '0.01')}
          ${inputField('KP / player', 'settings.kpPerPlayer', data.settings.kpPerPlayer, 'number', '0.01')}
          ${inputField('Segment / player', 'settings.segmentPerPlayer', data.settings.segmentPerPlayer, 'number', '0.01')}
          ${inputField('Max handicap', 'settings.maxHandicap', data.settings.maxHandicap, 'number')}
          ${inputField('Max handicap increase / week', 'settings.maxIncreasePerWeek', data.settings.maxIncreasePerWeek, 'number')}
        </div>
      </div>

      <div class="card col-5">
        <div class="kicker">Live Summary</div>
        <h2>At a Glance</h2>
        ${tableHTML(['Metric','Value'], [
          ['Active teams', calc.activeTeamCount],
          ['Teams with rounds', calc.playedTeams.length],
          ['Latest published pairings', calc.latestPublishedPairings ? calc.latestPublishedPairings.weekId : '—'],
          ['Latest scored week', calc.latestCompletedWeek ? calc.latestCompletedWeek.weekId : '—'],
          ['Current year-end', money(calc.yearEndTotal)],
          ['Current KP carry', money(calc.currentKpCarry)]
        ])}
      </div>

      <div class="card full">
        <div class="section-title-row">
          <div>
            <div class="kicker">Teams</div>
            <h2>12 Team Start + Mid-Season Adds</h2>
            <p class="footer-note">New teams can be added anytime. Teams with no rounds stay hidden from standings. New teams begin with 0 handicap until they have history.</p>
          </div>
          <div class="actions-inline"><button id="resetSeasonBtn" class="danger">Reset Season (Keep Teams)</button><button id="addTeamBtn" class="gold">Add Team</button></div>
        </div>
        ${tableHTML(['ID','Team Name','Player 1','Player 2','Player 3','Player 4','Actions'], data.teams.map((t, idx) => [
          t.id,
          `<input data-path="teams.${idx}.name" value="${escapeAttr(t.name)}">`,
          ...[0,1,2,3].map(p => `<input data-path="teams.${idx}.players.${p}" value="${escapeAttr(t.players[p] || '')}">`),
          `<button class="danger small-btn" data-remove-team="${t.id}">Remove</button>`
        ]))}
      </div>

      <div class="card full">
        <div class="section-title-row">
          <div>
            <div class="kicker">Quick Helper</div>
            <h2>What To Do Before and After League Night</h2>
          </div>
        </div>
        <div class="helper-grid">
          <div class="helper-box"><h3>Before League</h3><ol><li>Select the week</li><li>Generate Pairings</li><li>Publish Pairings</li><li>Export league-data.json</li></ol></div>
          <div class="helper-box"><h3>After League</h3><ol><li>Select the same week</li><li>Enter players and money</li><li>Enter scores</li><li>Enter KP or notes</li><li>Save This Week</li><li>Export league-data.json</li></ol></div>
          <div class="helper-box"><h3>Reminder</h3><p class="footer-note">The public page only changes after you export the updated <span class="mono">league-data.json</span> and replace the live file on your website.</p></div>
        </div>
      </div>

      <div class="card full">
        <div class="section-title-row">
          <div>
            <div class="kicker">Weekly Workflow</div>
            <h2>Publish Pairings First, Enter Results Later</h2>
            <p class="footer-note">Use Previous/Next week to move through the season. Saving or exporting automatically creates a backup of the selected week.</p>
          </div>
          <div class="actions-inline">
            <button id="prevWeekBtn" class="secondary">← Previous Week</button>
            <label style="min-width:320px">Choose week<select id="weekPicker">${data.weeks.map((w, idx) => `<option value="${idx}">${w.id} · ${fmtDate(w.date)} · ${w.segment} · ${weekStatus(w).label}</option>`).join('')}</select></label>
            <button id="nextWeekBtn" class="secondary">Next Week →</button>
          </div>
        </div>
        <div id="weekEditor"></div>
      </div>
    </div>
  `;
  bindGlobalAdmin(data, status);
  renderWeekEditor(data, Number(document.getElementById('weekPicker').value) || 0, status);
}

function bindGlobalAdmin(data, status){
  bindInputs(data, status);
  document.getElementById('saveLocalBtn').onclick = () => { saveWithAutoBackup(data, status, 'Global save'); adminPage(data, status); document.getElementById('weekPicker').value = String(currentWeekIndex()); renderWeekEditor(data, currentWeekIndex(), status); };
  document.getElementById('exportBtn').onclick = () => { exportWithAutoBackup(data, status); };
  document.getElementById('importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const incoming = normalizeData(JSON.parse(text));
    saveLocal(incoming);
    location.reload();
  };
  document.getElementById('addTeamBtn').onclick = () => {
    const nextNum = data.teams.length + 1;
    data.teams.push({ id: `T${nextNum}`, name: `Team ${nextNum}`, players: ['', '', '', ''] });
    saveLocal(data);
    adminPage(data, status);
    status.textContent = 'Team added.';
  };
  document.getElementById('resetSeasonBtn').onclick = () => {
    const ok = confirm('Reset the season and clear all weeks, scores, money, pairings, and standings while keeping the team list? A backup will be saved first.');
    if (!ok) return;
    resetSeasonKeepTeams(data);
    adminPage(data, status);
    status.textContent = 'Season reset complete. Teams were kept and a pre-reset backup was saved in this browser.';
  };
  document.querySelectorAll('[data-remove-team]').forEach(btn => btn.onclick = () => {
    const teamId = btn.dataset.removeTeam;
    const team = data.teams.find(t => t.id === teamId);
    if (!team) return;
    sanitizeTeam(data, teamId);
    team.name = '';
    team.players = ['', '', '', ''];
    saveLocal(data);
    adminPage(data, status);
    status.textContent = `${teamId} removed and cleared from saved pairings/scores.`;
  });
  const picker = document.getElementById('weekPicker');
  picker.onchange = (e) => renderWeekEditor(data, Number(e.target.value) || 0, status);
  document.getElementById('prevWeekBtn').onclick = () => { picker.value = String(Math.max(0, (Number(picker.value)||0) - 1)); renderWeekEditor(data, Number(picker.value)||0, status); };
  document.getElementById('nextWeekBtn').onclick = () => { picker.value = String(Math.min(data.weeks.length - 1, (Number(picker.value)||0) + 1)); renderWeekEditor(data, Number(picker.value)||0, status); };
}

function sanitizeTeam(data, teamId){
  data.weeks.forEach(week => {
    delete week.scores[teamId];
    week.pairings.forEach(p => {
      if (p.teamA === teamId) p.teamA = '';
      if (p.teamB === teamId) p.teamB = '';
    });
  });
}

function renderWeekEditor(data, weekIndex, status){
  const week = data.weeks[weekIndex];
  const availableTeams = activeTeams(data).filter(t => t.name.trim());
  const backups = weekBackupsFor(week.id);
  const holder = document.getElementById('weekEditor');
  holder.innerHTML = `
    <div class="admin-grid">
      <div class="card col-7">
        <div class="section-title-row">
          <div>
            <div class="kicker">Step 1</div>
            <h3>Pairings Publisher</h3>
            <p class="footer-note">Generate pairings for the upcoming week, tweak them if needed, then publish them to the public page.</p>
          </div>
          <div class="actions-inline">
            <button id="generatePairingsBtn">Generate Nearby Random Pairings</button>
            <button id="publishPairingsBtn" class="gold">${week.pairingsPublished ? 'Update Published Pairings' : 'Publish Pairings'}</button>
            <button id="clearPairingsBtn" class="secondary">Clear Pairings</button>
          </div>
        </div>
        <div class="week-block">
          <h3>${week.id} · ${fmtDate(week.date)} · <span class="badge">${week.segment}</span> ${weekStatusBadge(week)}</h3>
          <p class="footer-note">Published: ${week.pairingsPublished ? (week.publishedAt ? fmtDate(week.publishedAt) : 'Yes') : 'No'} · Status: ${weekStatus(week).label} · After publishing, click <strong>Export league-data.json</strong> to make the live public page update.</p>
          <table><thead><tr><th>Group</th><th>Team A</th><th>Team B</th></tr></thead><tbody>
            ${week.pairings.map((p, idx) => `<tr><td>${p.slot}</td><td>${teamSelect(`weeks.${weekIndex}.pairings.${idx}.teamA`, p.teamA, availableTeams)}</td><td>${teamSelect(`weeks.${weekIndex}.pairings.${idx}.teamB`, p.teamB, availableTeams)}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>

      <div class="card col-5">
        <div class="kicker">Step 2</div>
        <h3>Attendance, Money & Notes</h3>
        <div class="stat-pills mb-16"><div class="stat-pill">Week status ${weekStatus(week).label}</div><div class="stat-pill">Published ${week.pairingsPublished ? 'Yes' : 'No'}</div></div><div class="field-grid two-col">
          ${inputField('Attendance players', `weeks.${weekIndex}.attendancePlayers`, week.attendancePlayers, 'number')}
          ${inputField('Weekly extra money', `weeks.${weekIndex}.weeklyExtraMoney`, week.weeklyExtraMoney, 'number', '0.01')}
          ${inputField('Segment extra money', `weeks.${weekIndex}.segmentExtraMoney`, week.segmentExtraMoney, 'number', '0.01')}
          ${inputField('Year-end collected', `weeks.${weekIndex}.yearEndCollected`, week.yearEndCollected, 'number', '0.01')}
          ${inputField('Year-end extra money', `weeks.${weekIndex}.yearEndExtraMoney`, week.yearEndExtraMoney, 'number', '0.01')}
          ${inputField('Square revenue', `weeks.${weekIndex}.squareRevenue`, week.squareRevenue, 'number', '0.01')}
          ${inputField('Square prize cost', `weeks.${weekIndex}.squarePrizeCost`, week.squarePrizeCost, 'number', '0.01')}
          ${inputField('KP winner', `weeks.${weekIndex}.kpWinner`, week.kpWinner)}
          <div><label>KP won this week?</label><select data-path="weeks.${weekIndex}.kpWon"><option value="false" ${!week.kpWon ? 'selected' : ''}>No</option><option value="true" ${week.kpWon ? 'selected' : ''}>Yes</option></select></div>
          ${inputField('Week notes', `weeks.${weekIndex}.notes`, week.notes)}
        </div>
        <p class="footer-note">Segment money only goes into the segment for this selected week. Year-end stays at $0 until real weekly amounts are entered.</p>
      </div>

      <div class="card full">
        <div class="section-title-row">
          <div>
            <div class="kicker">Step 3</div>
            <h3>Gross Scores Entry</h3>
            <p class="note">Enter gross team score only. Handicaps, net, points, drops, segment money, and season standings all calculate automatically.</p>
          </div>
          <div class="stat-pills">
            <div class="stat-pill">Auto backups ${backups.length}</div>
            <div class="stat-pill">Last backup ${backups[0] ? formatDateTime(backups[0].savedAt) : 'None yet'}</div>
          </div>
        </div>
        ${tableHTML(['Team','Gross'], availableTeams.map(team => [
          escapeHTML(team.name),
          `<input type="number" step="1" data-path="weeks.${weekIndex}.scores.${team.id}" value="${escapeAttr(week.scores[team.id] ?? '')}">`
        ]))}
      </div>

      <div class="card full">
        <div class="section-title-row">
          <div>
            <div class="kicker">Step 4</div>
            <h3>Save, Export & Restore</h3>
            <p class="footer-note">Big save keeps your running totals in this browser. Export downloads a fresh JSON file for your live website. Both actions create an automatic backup of this selected week.</p>
          </div>
          <div class="actions-inline">
            <button id="saveWeekBtn" class="gold">Save This Week</button>
            <button id="exportWeekBtn">Export league-data.json</button>
            <button id="restorePreviousBtn" class="secondary" ${backups.length ? '' : 'disabled'}>Restore Previous Backup</button>
          </div>
        </div>
        <div class="field-grid two-col">
          <div>
            <label>Saved backups for ${week.id}</label>
            <select id="snapshotPicker" ${backups.length ? '' : 'disabled'}>
              ${backups.length ? backups.map((snap, idx) => `<option value="${idx}">${formatDateTime(snap.savedAt)} · ${escapeHTML(snap.label)}</option>`).join('') : '<option>No backups yet</option>'}
            </select>
          </div>
          <div>
            <label>How week-to-week saving works</label>
            <div class="footer-note" style="padding-top:10px">Each week stays stored inside <span class="mono">league-data.json</span>. When you move to the next week, the earlier weeks remain saved, and standings keep building from every saved week.</div>
          </div>
        </div>
      </div>
    </div>
  `;
  bindInputs(data, status);

  document.getElementById('generatePairingsBtn').onclick = () => {
    generatePairings(data, weekIndex);
    saveLocal(data);
    renderWeekEditor(data, weekIndex, status);
    status.textContent = `Generated pairings for ${week.id}.`;
  };
  document.getElementById('publishPairingsBtn').onclick = () => {
    week.pairingsPublished = true;
    week.publishedAt = week.date;
    saveLocal(data);
    renderWeekEditor(data, weekIndex, status);
    status.textContent = `${week.id} pairings published. Export league-data.json to make them live on the public page.`;
  };
  document.getElementById('clearPairingsBtn').onclick = () => {
    week.pairings = Array.from({length: 6}, (_, i) => ({ slot: i + 1, teamA: '', teamB: '' }));
    week.pairingsPublished = false;
    week.publishedAt = '';
    saveLocal(data);
    renderWeekEditor(data, weekIndex, status);
    status.textContent = `${week.id} pairings cleared.`;
  };
  document.getElementById('saveWeekBtn').onclick = () => {
    snapshotWeek(data, weekIndex, 'Week save');
    saveLocal(data);
    renderWeekEditor(data, weekIndex, status);
    status.textContent = `${week.id} saved locally with automatic backup.`;
  };
  document.getElementById('exportWeekBtn').onclick = () => {
    snapshotWeek(data, weekIndex, 'Week export');
    saveLocal(data);
    downloadData(data);
    renderWeekEditor(data, weekIndex, status);
    status.textContent = `${week.id} exported and backed up. Replace the live JSON file to publish changes.`;
  };
  const restoreBtn = document.getElementById('restorePreviousBtn');
  if (restoreBtn) restoreBtn.onclick = () => {
    const snapIndex = Number(document.getElementById('snapshotPicker').value) || 0;
    const ok = restoreWeekSnapshot(data, weekIndex, snapIndex);
    if (!ok) {
      status.textContent = `No backup found for ${week.id}.`;
      return;
    }
    renderWeekEditor(data, weekIndex, status);
    status.textContent = `${week.id} restored from backup.`;
  };
}

function generatePairings(data, weekIndex){
  const calc = calcLeague(data);
  const available = activeTeams(data).filter(t => t.name.trim());
  const ranks = Object.fromEntries(calc.seasonStandings.map((row, idx) => [row.teamId, idx + 1]));
  const sorted = available.slice().sort((a,b) => (ranks[a.id] || 999) - (ranks[b.id] || 999) || a.name.localeCompare(b.name));
  const groups = [];
  for (let i = 0; i < sorted.length; i += 4) {
    const chunk = shuffle(sorted.slice(i, i + 4));
    while (chunk.length >= 2) groups.push([chunk.shift(), chunk.shift()]);
    if (chunk.length) groups.push([chunk.shift(), null]);
  }
  if (groups.length > 1 && groups.at(-1)[1] === null) {
    const lone = groups.pop()[0];
    groups[groups.length - 1][1] = lone;
  }
  const week = data.weeks[weekIndex];
  week.pairings = Array.from({length: 6}, (_, i) => ({ slot: i + 1, teamA: groups[i]?.[0]?.id || '', teamB: groups[i]?.[1]?.id || '' }));
}
function shuffle(arr){
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function teamSelect(path, selected, teams){
  return `<select data-path="${path}"><option value="">—</option>${teams.map(t => `<option value="${t.id}" ${selected === t.id ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}</select>`;
}
function inputField(label, path, value, type='text', step='1'){
  return `<div><label>${label}</label><input type="${type}" ${type === 'number' ? `step="${step}"` : ''} data-path="${path}" value="${escapeAttr(value ?? '')}"></div>`;
}
function bindInputs(data, status){
  document.querySelectorAll('[data-path]').forEach(el => {
    el.onchange = () => {
      const val = el.tagName === 'SELECT'
        ? (el.value === 'true' ? true : el.value === 'false' ? false : el.value)
        : (el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value);
      setPath(data, el.dataset.path, val);
      saveLocal(data);
      status.textContent = 'Saved locally. Export league-data.json when ready to publish.';
    };
  });
}

async function initPublic(){ publicPage(await loadData(false)); }
async function initAdmin(){
  const unlock = sessionStorage.getItem(SESSION_KEY) === 'yes';
  const data = await loadData(true);
  const gate = document.getElementById('gate');
  const panel = document.getElementById('panel');
  const status = document.getElementById('saveStatus');
  const showPanel = () => { gate.classList.add('hidden'); panel.classList.remove('hidden'); adminPage(data, status); };
  if (unlock) showPanel();
  document.getElementById('unlockBtn').onclick = () => {
    if (document.getElementById('pwd').value === data.settings.adminPassword) {
      sessionStorage.setItem(SESSION_KEY, 'yes');
      showPanel();
    } else {
      document.getElementById('gateStatus').textContent = 'Incorrect password.';
    }
  };
  document.getElementById('logoutBtn').onclick = () => { sessionStorage.removeItem(SESSION_KEY); location.reload(); };
}

window.MensLeagueApp = { initPublic, initAdmin, loadData, calcLeague };
})();
