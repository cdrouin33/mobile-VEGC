(function(){
'use strict';

const DATA_FILE = 'league-data.json';
const STORAGE_KEY = 'mensNightLeague2026_local_v1';
const SESSION_KEY = 'mensNightLeague2026_unlock_v1';
const BACKUP_KEY = 'mensNightLeague2026_backups_v1';

const MINI_SEASONS = [
  { key: 'preseason', label: 'Mini Season 1 — Preseason', short: 'Preseason', official: false, weeks: ['W1','W2','W3'], drop: false },
  { key: 'ms2', label: 'Mini Season 2', short: 'Mini Season 2', official: true, weeks: ['W4','W5','W6','W7'], drop: true },
  { key: 'ms3', label: 'Mini Season 3', short: 'Mini Season 3', official: true, weeks: ['W8','W9','W10','W11'], drop: true },
  { key: 'ms4', label: 'Mini Season 4', short: 'Mini Season 4', official: true, weeks: ['W12','W13','W14','W15'], drop: true },
  { key: 'ms5', label: 'Mini Season 5', short: 'Mini Season 5', official: true, weeks: ['W16','W17','W18','W19'], drop: true }
];

const DEFAULT_DATA = {
  settings: {
    courseName: 'Vegreville Kinsmen Golf Club',
    leagueName: '2026 Mens Night League',
    adminPassword: 'mens2026',
    weeklyPayoutPerPlayer: 7.5,
    kpPerPlayer: 2.5,
    miniSeasonPerPlayer: 5,
    seasonBuyInPerPlayer: 100,
    weeklySplit: [0.5, 0.3, 0.2],
    miniSeasonSplit: [0.5, 0.3, 0.2],
    yearEndSplit: [0.4, 0.3, 0.2, 0.1],
    preseasonMaxChange: 4,
    inSeasonMaxChange: 2,
    maxHandicap: 12,
    holeInOneDefault: 5000,
  },
  yearEndCollected: 0,
  teams: Array.from({ length: 12 }, (_, i) => ({ id: `T${i+1}`, name: `Team ${i+1}`, players: ['', '', '', ''] })),
  weeks: [
    makeWeek('W1', '2026-05-05', 'preseason'),
    makeWeek('W2', '2026-05-12', 'preseason'),
    makeWeek('W3', '2026-05-19', 'preseason'),
    makeWeek('W4', '2026-05-26', 'ms2'),
    makeWeek('W5', '2026-06-02', 'ms2'),
    makeWeek('W6', '2026-06-09', 'ms2'),
    makeWeek('W7', '2026-06-16', 'ms2'),
    makeWeek('W8', '2026-06-23', 'ms3'),
    makeWeek('W9', '2026-06-30', 'ms3'),
    makeWeek('W10', '2026-07-07', 'ms3'),
    makeWeek('W11', '2026-07-14', 'ms3'),
    makeWeek('W12', '2026-07-21', 'ms4'),
    makeWeek('W13', '2026-07-28', 'ms4'),
    makeWeek('W14', '2026-08-04', 'ms4'),
    makeWeek('W15', '2026-08-11', 'ms4'),
    makeWeek('W16', '2026-08-18', 'ms5'),
    makeWeek('W17', '2026-08-25', 'ms5'),
    makeWeek('W18', '2026-09-01', 'ms5'),
    makeWeek('W19', '2026-09-08', 'ms5')
  ]
};

function makeWeek(id, date, miniSeasonKey){
  return {
    id,
    date,
    miniSeasonKey,
    attendancePlayers: 0,
    weeklyExtraMoney: 0,
    miniSeasonExtraMoney: 0,
    yearEndExtraMoney: 0,
    squareNetAmount: 0,
    squareAllocation: 'split',
    kpWinner: '',
    kpWon: false,
    pairingsPublished: false,
    pairings: Array.from({ length: 8 }, (_, i) => ({ hole: i + 1, teamA: '', teamB: '' })),
    scores: {},
    mealOption: '',
    mealPrice: '',
    drinkSpecial: '',
    holeInOnePrize: '',
    extraNote: ''
  };
}

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function $(id){ return document.getElementById(id); }
function escapeHTML(str){ return String(str ?? '').replace(/[&<>"]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m])); }
function escapeAttr(str){ return escapeHTML(str).replace(/'/g, '&#39;'); }
function number(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round2(n){ return Math.round((Number(n) || 0) * 100) / 100; }
function money(n){ return `$${round2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(dateStr){ return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function ordinal(n){ return ['th','st','nd','rd'][((n%100-20)%10)] || ['th','st','nd','rd'][n%100] || 'th'; }
function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function isFilled(val){ return val !== undefined && val !== null && String(val).trim() !== ''; }
function activeTeams(data){ return data.teams.filter(t => isFilled(t.name)); }
function teamName(data, teamId){ const team = data.teams.find(t => t.id === teamId); return team?.name || '—'; }
function getMiniSeasonByKey(key){ return MINI_SEASONS.find(s => s.key === key); }
function getWeek(data, weekId){ return data.weeks.find(w => w.id === weekId); }
function weekHasScores(week){ return Object.values(week.scores || {}).some(v => String(v).trim() !== ''); }
function weekHasPairings(week){ return (week.pairings || []).some(p => p.teamA || p.teamB); }

function normalizeData(incoming){
  const data = clone(DEFAULT_DATA);
  if (!incoming || typeof incoming !== 'object') return data;
  data.settings = { ...data.settings, ...(incoming.settings || {}) };
  data.yearEndCollected = number(incoming.yearEndCollected);
  if (Array.isArray(incoming.teams)) {
    data.teams = incoming.teams.map((t, idx) => ({
      id: t.id || `T${idx+1}`,
      name: t.name || '',
      players: Array.isArray(t.players) ? [0,1,2,3].map(i => t.players[i] || '') : ['', '', '', '']
    }));
  }
  if (Array.isArray(incoming.weeks)) {
    data.weeks = DEFAULT_DATA.weeks.map(base => {
      const match = incoming.weeks.find(w => w.id === base.id) || {};
      return {
        ...clone(base),
        ...match,
        attendancePlayers: number(match.attendancePlayers),
        weeklyExtraMoney: number(match.weeklyExtraMoney),
        miniSeasonExtraMoney: number(match.miniSeasonExtraMoney),
        yearEndExtraMoney: number(match.yearEndExtraMoney),
        squareNetAmount: number(match.squareNetAmount),
        squareAllocation: ['mini-season','year-end','split'].includes(match.squareAllocation) ? match.squareAllocation : 'split',
        kpWinner: match.kpWinner || '',
        kpWon: !!match.kpWon,
        pairingsPublished: !!match.pairingsPublished,
        scores: match.scores && typeof match.scores === 'object' ? match.scores : {},
        mealOption: match.mealOption || '',
        mealPrice: match.mealPrice || '',
        drinkSpecial: match.drinkSpecial || '',
        holeInOnePrize: match.holeInOnePrize || '',
        extraNote: match.extraNote || '',
        pairings: Array.isArray(match.pairings) ? match.pairings.map((p, i) => ({ hole: p.hole || i+1, teamA: p.teamA || '', teamB: p.teamB || '' })) : clone(base.pairings)
      };
    });
  }
  return data;
}

async function loadData(preferLocal){
  if (preferLocal) {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) return normalizeData(JSON.parse(local));
  }
  try {
    const res = await fetch(`${DATA_FILE}?v=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      return normalizeData(json);
    }
  } catch (err) {}
  const local = localStorage.getItem(STORAGE_KEY);
  return local ? normalizeData(JSON.parse(local)) : normalizeData(DEFAULT_DATA);
}

function saveLocal(data){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2)); }
function clearLocal(){ localStorage.removeItem(STORAGE_KEY); }
function setUnlocked(isUnlocked){ if (isUnlocked) sessionStorage.setItem(SESSION_KEY, 'yes'); else sessionStorage.removeItem(SESSION_KEY); }
function isUnlocked(){ return sessionStorage.getItem(SESSION_KEY) === 'yes'; }

function saveBackup(data, reason){
  const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
  backups.unshift({
    timestamp: new Date().toISOString(),
    reason,
    data: clone(data)
  });
  localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, 30)));
}

function restoreWeekFromBackup(currentData, weekId){
  const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
  const backup = backups.find(b => b.data?.weeks?.some(w => w.id === weekId));
  if (!backup) return null;
  const restored = clone(currentData);
  const weekCopy = backup.data.weeks.find(w => w.id === weekId);
  restored.weeks = restored.weeks.map(w => w.id === weekId ? clone(weekCopy) : w);
  restored.yearEndCollected = backup.data.yearEndCollected ?? restored.yearEndCollected;
  restored.settings = { ...restored.settings, ...(backup.data.settings || {}) };
  restored.teams = clone(backup.data.teams || restored.teams);
  return restored;
}

function downloadData(data){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'league-data.json';
  a.click();
  URL.revokeObjectURL(url);
}

function computeStatus(week){
  const hasScores = weekHasScores(week);
  const hasPairings = weekHasPairings(week);
  if (!hasPairings && !hasScores && !week.attendancePlayers && !week.weeklyExtraMoney && !week.mealOption && !week.drinkSpecial) return { label: 'Not Started', className: 'status-not-started' };
  if (hasPairings && !week.pairingsPublished && !hasScores) return { label: 'Pairings Draft', className: 'status-pairings-draft' };
  if (week.pairingsPublished && !hasScores) return { label: 'Pairings Posted', className: 'status-pairings-posted' };
  if (hasScores && !week.attendancePlayers) return { label: 'Results Started', className: 'status-results-started' };
  if (hasScores || week.attendancePlayers || week.kpWon || week.kpWinner) return { label: 'Completed', className: 'status-completed' };
  return { label: 'Not Started', className: 'status-not-started' };
}

function calculateLeague(data){
  const teams = activeTeams(data);
  const teamState = Object.fromEntries(teams.map(team => [team.id, {
    handicap: 0,
    differentials: [],
    appliedHandicaps: [],
    weeklyGrossDiffs: {},
    weeklyPoints: {},
    weeklyResults: {},
    currentWinnings: 0,
    droppedWeekIds: new Set(),
  }]));

  const weekly = [];
  let kpCarry = 0;
  let officialSeasonWeeklyPots = 0;
  let officialSeasonYearEndExtras = 0;
  const miniSeasonPots = Object.fromEntries(MINI_SEASONS.map(ms => [ms.key, 0]));

  data.weeks.forEach((week, weekIndex) => {
    const miniSeason = getMiniSeasonByKey(week.miniSeasonKey);
    const teamsWithScores = teams
      .map(team => ({ teamId: team.id, gross: isFilled(week.scores[team.id]) ? Number(week.scores[team.id]) : null }))
      .filter(item => Number.isFinite(item.gross));
    const bestGross = teamsWithScores.length ? Math.min(...teamsWithScores.map(t => t.gross)) : null;
    const baselineByTeam = {};
    const minAvgDiff = (() => {
      const avgs = teams.map(team => teamState[team.id].differentials.length ? avg(teamState[team.id].differentials) : 0);
      return avgs.length ? Math.min(...avgs) : 0;
    })();

    teams.forEach(team => {
      const priorAvg = teamState[team.id].differentials.length ? avg(teamState[team.id].differentials) : 0;
      baselineByTeam[team.id] = Math.max(0, priorAvg - minAvgDiff);
    });

    const results = teamsWithScores.map(item => {
      const previousHdcp = teamState[item.teamId].appliedHandicaps.length ? teamState[item.teamId].appliedHandicaps[teamState[item.teamId].appliedHandicaps.length - 1] : 0;
      const rawTarget = Math.round(clamp(baselineByTeam[item.teamId], 0, data.settings.maxHandicap));
      const cap = weekIndex < 3 ? number(data.settings.preseasonMaxChange) : number(data.settings.inSeasonMaxChange);
      const low = Math.max(0, previousHdcp - cap);
      const high = Math.min(number(data.settings.maxHandicap), previousHdcp + cap);
      const handicap = weekIndex === 0 ? 0 : clamp(rawTarget, low, high);
      const grossDiff = bestGross === null ? 0 : Math.max(0, item.gross - bestGross);
      const net = item.gross - handicap;
      return { teamId: item.teamId, gross: item.gross, grossDiff, handicap, net, points: 0 };
    }).sort((a,b) => a.net - b.net || a.gross - b.gross || teamName(data, a.teamId).localeCompare(teamName(data, b.teamId)));

    awardPoints(results);

    results.forEach(row => {
      teamState[row.teamId].appliedHandicaps.push(row.handicap);
      teamState[row.teamId].differentials.push(row.grossDiff);
      teamState[row.teamId].weeklyGrossDiffs[week.id] = row.grossDiff;
      teamState[row.teamId].weeklyPoints[week.id] = row.points;
      teamState[row.teamId].weeklyResults[week.id] = row;
    });

    const players = number(week.attendancePlayers);
    const weeklyPool = players * number(data.settings.weeklyPayoutPerPlayer) + number(week.weeklyExtraMoney);
    const kpPool = players * number(data.settings.kpPerPlayer);
    const miniSeasonPoolAddBase = players * number(data.settings.miniSeasonPerPlayer) + number(week.miniSeasonExtraMoney);
    const square = number(week.squareNetAmount);
    const miniSeasonSquareAdd = week.squareAllocation === 'mini-season' ? square : week.squareAllocation === 'split' ? round2(square / 2) : 0;
    const yearEndSquareAdd = week.squareAllocation === 'year-end' ? square : week.squareAllocation === 'split' ? round2(square - miniSeasonSquareAdd) : 0;
    const yearEndExtra = number(week.yearEndExtraMoney) + yearEndSquareAdd;
    miniSeasonPots[week.miniSeasonKey] += miniSeasonPoolAddBase + miniSeasonSquareAdd;
    if (miniSeason.official) officialSeasonYearEndExtras += yearEndExtra;
    if (miniSeason.official) officialSeasonWeeklyPots += weeklyPool;

    const weeklyPayoutRows = payoutRows(weeklyPool, data.settings.weeklySplit, 3);
    const weeklyAwardRows = assignTiedPayouts(results, data.settings.weeklySplit, weeklyPool, 'net');
    weeklyAwardRows.forEach(payout => {
      if (teamState[payout.teamId]) teamState[payout.teamId].currentWinnings += payout.amount;
    });

    const kpAvailable = kpCarry + kpPool;
    const kpPaid = week.kpWon ? kpAvailable : 0;
    if (week.kpWon && week.kpWinner) {
      const winnerTeam = teams.find(t => t.name === week.kpWinner || t.id === week.kpWinner);
      if (winnerTeam) teamState[winnerTeam.id].currentWinnings += kpPaid;
    }
    kpCarry = week.kpWon ? 0 : kpAvailable;

    weekly.push({
      ...clone(week),
      miniSeason,
      bestGross,
      results,
      status: computeStatus(week),
      payouts: { weeklyPool, weeklyPayoutRows, weeklyAwardRows, kpPool, kpAvailable, kpPaid, kpCarryAfter: kpCarry, miniSeasonAdd: miniSeasonPoolAddBase + miniSeasonSquareAdd, yearEndAdd: yearEndExtra }
    });
  });

  const miniSeasonStandings = {};
  const miniSeasonPayoutRows = {};
  MINI_SEASONS.forEach(ms => {
    const standings = [];
    teams.forEach(team => {
      const playedWeeks = ms.weeks.filter(weekId => teamState[team.id].weeklyResults[weekId]);
      if (!playedWeeks.length) return;
      let droppedWeekId = null;
      if (ms.drop && playedWeeks.length >= 2) {
        droppedWeekId = playedWeeks.slice().sort((a,b) => {
          const diffDelta = teamState[team.id].weeklyGrossDiffs[b] - teamState[team.id].weeklyGrossDiffs[a];
          if (diffDelta !== 0) return diffDelta;
          return (teamState[team.id].weeklyPoints[a] || 0) - (teamState[team.id].weeklyPoints[b] || 0);
        })[0];
        teamState[team.id].droppedWeekIds.add(droppedWeekId);
      }
      const countedWeekIds = playedWeeks.filter(id => id !== droppedWeekId);
      const countedPoints = round2(countedWeekIds.reduce((sum,id)=>sum + (teamState[team.id].weeklyPoints[id] || 0), 0));
      const rawPoints = round2(playedWeeks.reduce((sum,id)=>sum + (teamState[team.id].weeklyPoints[id] || 0), 0));
      standings.push({
        teamId: team.id,
        teamName: team.name,
        played: playedWeeks.length,
        rawPoints,
        countedPoints,
        droppedWeekId,
        droppedGrossDiff: droppedWeekId ? teamState[team.id].weeklyGrossDiffs[droppedWeekId] : null
      });
    });
    standings.sort((a,b) => b.countedPoints - a.countedPoints || b.rawPoints - a.rawPoints || a.teamName.localeCompare(b.teamName));
    assignRank(standings, 'countedPoints');
    miniSeasonStandings[ms.key] = standings;

    const pot = miniSeasonPots[ms.key] || 0;
    const payoutRowsForSeason = payoutRows(pot, data.settings.miniSeasonSplit, 3);
    const miniSeasonAwardRows = assignTiedPayouts(standings, data.settings.miniSeasonSplit, pot, 'countedPoints');
    miniSeasonPayoutRows[ms.key] = { baseRows: payoutRowsForSeason, awardRows: miniSeasonAwardRows };

    const completed = ms.weeks.every(weekId => {
      const w = weekly.find(entry => entry.id === weekId);
      return w && w.results.length > 0;
    });
    if (completed) {
      miniSeasonAwardRows.forEach(row => {
        if (teamState[row.teamId]) teamState[row.teamId].currentWinnings += row.amount;
      });
    }
  });

  const currentMiniSeason = MINI_SEASONS.find(ms => ms.weeks.includes(findLatestWeekWithData(weekly)?.id || '')) || MINI_SEASONS[0];

  const seasonStandings = teams
    .map(team => {
      const officialWeekIds = MINI_SEASONS.filter(ms => ms.official).flatMap(ms => ms.weeks).filter(weekId => teamState[team.id].weeklyResults[weekId]);
      if (!officialWeekIds.length) return null;
      const countedWeekIds = officialWeekIds.filter(weekId => !teamState[team.id].droppedWeekIds.has(weekId));
      const points = round2(countedWeekIds.reduce((sum,id)=> sum + (teamState[team.id].weeklyPoints[id] || 0), 0));
      const grossPoints = round2(officialWeekIds.reduce((sum,id)=> sum + (teamState[team.id].weeklyPoints[id] || 0), 0));
      const currentHdcp = teamState[team.id].appliedHandicaps.length ? teamState[team.id].appliedHandicaps[teamState[team.id].appliedHandicaps.length - 1] : 0;
      return {
        teamId: team.id,
        teamName: team.name,
        points,
        grossPoints,
        handicap: currentHdcp,
        currentWinnings: round2(teamState[team.id].currentWinnings)
      };
    })
    .filter(Boolean)
    .sort((a,b) => b.points - a.points || b.grossPoints - a.grossPoints || a.teamName.localeCompare(b.teamName));
  assignRank(seasonStandings, 'points');

  const yearEndPurse = round2(number(data.yearEndCollected) + officialSeasonYearEndExtras);
  const projectedYearEndRows = payoutRows(yearEndPurse, data.settings.yearEndSplit, 4);
  const projectedYearEndAwards = assignTiedPayouts(seasonStandings, data.settings.yearEndSplit, yearEndPurse, 'points');
  const projectedMap = Object.fromEntries(projectedYearEndAwards.map(row => [row.teamId, row.amount]));
  seasonStandings.forEach((row) => {
    row.projectedYearEnd = projectedMap[row.teamId] || 0;
  });

  const preseasonStandings = miniSeasonStandings.preseason || [];
  const latestWeek = findLatestWeekWithData(weekly) || weekly[0];
  const latestCompletedWeek = [...weekly].reverse().find(w => w.results.length) || null;
  const publicPairingsWeek = [...weekly].reverse().find(w => w.pairingsPublished && weekHasPairings(w)) || weekly[0];

  return {
    teams,
    weekly,
    miniSeasonStandings,
    miniSeasonPayoutRows,
    miniSeasonPots,
    preseasonStandings,
    seasonStandings,
    yearEndPurse,
    projectedYearEndRows,
    currentMiniSeason,
    latestWeek,
    latestCompletedWeek,
    publicPairingsWeek,
    kpCarry,
  };
}

function assignRank(rows, key){
  let lastVal = null;
  let lastRank = 0;
  rows.forEach((row, index) => {
    const val = row[key];
    row.rank = lastVal !== null && val === lastVal ? lastRank : index + 1;
    lastVal = val;
    lastRank = row.rank;
  });
}

function payoutRows(total, split, maxCount){
  return split.slice(0, maxCount).map((pct, index) => ({ place: index + 1, amount: round2(total * pct) }));
}

function placeLabel(rank){
  return `T${rank}`;
}

function assignTiedPayouts(sortedRows, split, total, scoreKey){
  const buckets = payoutRows(total, split, split.length);
  const payouts = [];
  let cursor = 1;
  let i = 0;
  while (i < sortedRows.length && cursor <= split.length) {
    let j = i + 1;
    while (j < sortedRows.length && sortedRows[j][scoreKey] === sortedRows[i][scoreKey]) j += 1;
    const tieCount = j - i;
    const occupied = [];
    for (let place = cursor; place < cursor + tieCount && place <= split.length; place += 1) occupied.push(place);
    const amount = round2(occupied.reduce((sum, place) => sum + (buckets[place - 1]?.amount || 0), 0) / Math.max(tieCount, 1));
    for (let k = i; k < j; k += 1) payouts.push({ teamId: sortedRows[k].teamId, place: cursor, displayPlace: tieCount > 1 ? placeLabel(cursor) : String(cursor), amount });
    cursor += tieCount;
    i = j;
  }
  return payouts;
}

function awardPoints(results){
  const n = results.length;
  let i = 0;
  while (i < results.length) {
    let j = i + 1;
    while (j < results.length && results[j].net === results[i].net) j += 1;
    const pts = [];
    for (let pos = i; pos < j; pos += 1) pts.push(n - pos);
    const shared = avg(pts);
    for (let pos = i; pos < j; pos += 1) results[pos].points = round2(shared);
    i = j;
  }
}

function findLatestWeekWithData(weekly){
  return [...weekly].reverse().find(w => w.results.length || w.pairingsPublished || weekHasPairings(w) || w.attendancePlayers || w.mealOption || w.drinkSpecial) || null;
}


function blankFutureWeek(week){
  return {
    ...clone(week),
    attendancePlayers: 0,
    weeklyExtraMoney: 0,
    miniSeasonExtraMoney: 0,
    yearEndExtraMoney: 0,
    squareNetAmount: 0,
    squareAllocation: 'split',
    kpWinner: '',
    kpWon: false,
    pairingsPublished: false,
    pairings: Array.from({ length: 8 }, (_, i) => ({ hole: i + 1, teamA: '', teamB: '' })),
    scores: {},
    mealOption: '',
    mealPrice: '',
    drinkSpecial: '',
    holeInOnePrize: '',
    extraNote: ''
  };
}

function calculateLeagueThroughWeek(data, weekIndex){
  const partial = clone(data);
  partial.weeks = partial.weeks.map((week, idx) => idx <= weekIndex ? week : blankFutureWeek(week));
  return calculateLeague(partial);
}

function buildRankMap(rows){
  return Object.fromEntries(rows.map(row => [row.teamId, row.rank]));
}

function rankDeltaPhrase(delta){
  if (delta > 0) return `climbed ${delta} spot${delta === 1 ? '' : 's'}`;
  if (delta < 0) return `slipped ${Math.abs(delta)} spot${Math.abs(delta) === 1 ? '' : 's'}`;
  return 'held position';
}


function downloadFile(filename, content, type){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function excelCell(value){
  const str = String(value ?? '');
  if (/^-?\d+(\.\d+)?$/.test(str)) return `<td>${str}</td>`;
  return `<td>${escapeHTML(str)}</td>`;
}

function buildValidationRows(data, weekEntry){
  const players = number(weekEntry.attendancePlayers);
  const weeklyPlayerMoney = round2(players * number(data.settings.weeklyPayoutPerPlayer));
  const kpPlayerMoney = round2(players * number(data.settings.kpPerPlayer));
  const miniSeasonPlayerMoney = round2(players * number(data.settings.miniSeasonPerPlayer));
  const weeklyExtra = round2(number(weekEntry.weeklyExtraMoney));
  const miniExtra = round2(number(weekEntry.miniSeasonExtraMoney));
  const yearEndExtra = round2(number(weekEntry.yearEndExtraMoney));
  const square = round2(number(weekEntry.squareNetAmount));
  const miniSquare = weekEntry.squareAllocation === 'mini-season' ? square : weekEntry.squareAllocation === 'split' ? round2(square / 2) : 0;
  const yearEndSquare = weekEntry.squareAllocation === 'year-end' ? square : weekEntry.squareAllocation === 'split' ? round2(square - miniSquare) : 0;
  const weeklyPool = round2(weekEntry.payouts.weeklyPool);
  const weeklyPaid = round2((weekEntry.payouts.weeklyAwardRows || []).reduce((sum, row) => sum + number(row.amount), 0));
  const miniAllocated = round2(weekEntry.payouts.miniSeasonAdd);
  const yearEndAllocated = round2(weekEntry.payouts.yearEndAdd);
  const kpPoolThisWeek = round2(weekEntry.payouts.kpPool);
  const kpPaid = round2(weekEntry.kpWon ? weekEntry.payouts.kpPaid : 0);
  const kpCarryForward = round2(weekEntry.payouts.kpCarryAfter);
  const moneyIn = round2(weeklyPlayerMoney + kpPlayerMoney + miniSeasonPlayerMoney + weeklyExtra + miniExtra + yearEndExtra + square);
  const moneyOut = round2(weeklyPaid + miniAllocated + yearEndAllocated + kpPaid + (weekEntry.kpWon ? 0 : kpCarryForward));
  const difference = round2(moneyIn - moneyOut);
  const isBalanced = Math.abs(difference) < 0.01;

  return {
    players,
    weeklyPlayerMoney,
    kpPlayerMoney,
    miniSeasonPlayerMoney,
    weeklyExtra,
    miniExtra,
    yearEndExtra,
    square,
    miniSquare,
    yearEndSquare,
    weeklyPool,
    weeklyPaid,
    miniAllocated,
    yearEndAllocated,
    kpPoolThisWeek,
    kpPaid,
    kpCarryForward,
    moneyIn,
    moneyOut,
    difference,
    isBalanced
  };
}

function buildWeeklyAuditWorkbookHTML(data, weekIndex){
  const calc = calculateLeague(data);
  const week = calc.weekly.find(w => w.id === data.weeks[weekIndex].id);
  if (!week) return '';
  const miniSeason = getMiniSeasonByKey(week.miniSeasonKey);
  const validation = buildValidationRows(data, week);

  const rankingRows = week.results.map((row, idx) => {
    const payout = week.payouts.weeklyAwardRows.find(item => item.teamId === row.teamId);
    return `<tr>${[
        idx + 1,
        teamName(data, row.teamId),
        row.gross,
        row.handicap,
        row.net,
        row.points,
        payout ? payout.displayPlace : '',
        payout ? round2(payout.amount) : ''
      ].map(excelCell).join('')}</tr>`;
  }).join('');

  const payoutRowsHtml = (week.payouts.weeklyAwardRows || []).map(row => {
    const result = week.results.find(item => item.teamId === row.teamId);
    return `<tr>${[
        row.displayPlace,
        teamName(data, row.teamId),
        result ? result.net : '',
        round2(row.amount)
      ].map(excelCell).join('')}</tr>`;
  }).join('');

  const pairingsRows = (week.pairings || []).filter(pair => pair.teamA || pair.teamB).map(pair => `<tr>${[
    pair.hole,
    teamName(data, pair.teamA),
    teamName(data, pair.teamB)
  ].map(excelCell).join('')}</tr>`).join('');

  const winners = week.results.slice(0, 3).map((row, idx) => {
    const payout = week.payouts.weeklyAwardRows.find(item => item.teamId === row.teamId);
    return `<tr>${[
        idx + 1,
        teamName(data, row.teamId),
        row.net,
        payout ? round2(payout.amount) : ''
      ].map(excelCell).join('')}</tr>`;
  }).join('');

  const validationRows = [
    ['Attendance Players', validation.players],
    ['Weekly player contribution', validation.weeklyPlayerMoney],
    ['KP player contribution', validation.kpPlayerMoney],
    ['Mini season player contribution', validation.miniSeasonPlayerMoney],
    ['Weekly extra money', validation.weeklyExtra],
    ['Mini season extra money', validation.miniExtra],
    ['Year-end extra money', validation.yearEndExtra],
    ['Squares net amount', validation.square],
    ['Squares to mini season', validation.miniSquare],
    ['Squares to year-end', validation.yearEndSquare],
    ['Weekly pot', validation.weeklyPool],
    ['Weekly payouts paid', validation.weeklyPaid],
    ['Mini season allocated', validation.miniAllocated],
    ['Year-end allocated', validation.yearEndAllocated],
    ['KP pool this week', validation.kpPoolThisWeek],
    ['KP paid this week', validation.kpPaid],
    ['KP carry forward', validation.kpCarryForward],
    ['Total money in', validation.moneyIn],
    ['Total money out + carry', validation.moneyOut],
    ['Difference', validation.difference],
    ['Validation', validation.isBalanced ? 'BALANCED' : 'CHECK NUMBERS']
  ].map(row => `<tr>${row.map(excelCell).join('')}</tr>`).join('');

  const metaRows = [
    ['Course', data.settings.courseName],
    ['League', data.settings.leagueName],
    ['Week', week.id],
    ['Date', fmtDate(week.date)],
    ['Mini Season', miniSeason.label],
    ['Week Status', week.status.label],
    ['Pairings Published', week.pairingsPublished ? 'Yes' : 'No'],
    ['KP Winner', week.kpWinner || 'Not won'],
    ['KP Won?', week.kpWon ? 'Yes' : 'No'],
    ['Hole-in-One Prize', week.holeInOnePrize || money(data.settings.holeInOneDefault)],
    ['Meal Option', week.mealOption || ''],
    ['Meal Price', week.mealPrice || ''],
    ['Drink Special', week.drinkSpecial || ''],
    ['Extra Note', week.extraNote || '']
  ].map(row => `<tr>${row.map(excelCell).join('')}</tr>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="application/vnd.ms-excel; charset=UTF-8">
<title>Weekly Audit Report</title>
<style>
body { font-family: Arial, sans-serif; }
table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }
th, td { border: 1px solid #888; padding: 6px 8px; text-align: left; }
th { background: #e9e9e9; }
h1, h2 { margin: 8px 0; }
</style>
</head>
<body>
  <h1>${escapeHTML(data.settings.leagueName)} — Weekly Audit Report</h1>
  <h2>${escapeHTML(week.id)} — ${escapeHTML(fmtDate(week.date))}</h2>

  <table>
    <thead><tr><th colspan="2">Validation Summary</th></tr></thead>
    <tbody>${validationRows}</tbody>
  </table>

  <table>
    <thead><tr><th colspan="2">Week Summary</th></tr></thead>
    <tbody>${metaRows}</tbody>
  </table>

  <table>
    <thead><tr><th colspan="4">Top Finishers</th></tr><tr><th>Place</th><th>Team</th><th>Net</th><th>Payout</th></tr></thead>
    <tbody>${winners || '<tr><td colspan="4">No completed scores yet.</td></tr>'}</tbody>
  </table>

  <table>
    <thead><tr><th colspan="8">Scores and Results</th></tr><tr><th>Rank</th><th>Team</th><th>Gross</th><th>Handicap</th><th>Net</th><th>Points</th><th>Payout Place</th><th>Payout</th></tr></thead>
    <tbody>${rankingRows || '<tr><td colspan="8">No completed scores yet.</td></tr>'}</tbody>
  </table>

  <table>
    <thead><tr><th colspan="4">Weekly Payout Audit</th></tr><tr><th>Place</th><th>Team</th><th>Net</th><th>Amount</th></tr></thead>
    <tbody>${payoutRowsHtml || '<tr><td colspan="4">No weekly payouts yet.</td></tr>'}</tbody>
  </table>

  <table>
    <thead><tr><th colspan="3">Pairings</th></tr><tr><th>Hole</th><th>Team 1</th><th>Team 2</th></tr></thead>
    <tbody>${pairingsRows || '<tr><td colspan="3">No pairings entered.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

function downloadWeeklyAuditReport(data, weekIndex){
  const calc = calculateLeague(data);
  const week = calc.weekly.find(w => w.id === data.weeks[weekIndex].id);
  if (!week) return false;
  const html = buildWeeklyAuditWorkbookHTML(data, weekIndex);
  const filename = `mens-night-${week.id.toLowerCase()}-audit-report.xls`;
  downloadFile(filename, html, 'application/vnd.ms-excel');
  return true;
}

function buildWeeklyRecap(data, weekIndex){
  const calcAfter = calculateLeagueThroughWeek(data, weekIndex);
  const week = calcAfter.weekly.find(w => w.id === data.weeks[weekIndex].id);
  if (!week || !week.results.length) return '';
  const calcBefore = weekIndex > 0 ? calculateLeagueThroughWeek(data, weekIndex - 1) : null;
  const beforeRanks = buildRankMap(calcBefore?.seasonStandings || []);
  const afterRanks = buildRankMap(calcAfter.seasonStandings || []);
  const topResults = week.results.slice(0, 3);
  const winner = topResults[0];
  const second = topResults[1];
  const third = topResults[2];
  const payoutLines = week.payouts.weeklyAwardRows
    .map(row => `${row.displayPlace}: ${teamName(data, row.teamId)} — ${money(row.amount)}`)
    .join('\n');

  const movers = (calcAfter.seasonStandings || []).map(row => {
    const after = afterRanks[row.teamId];
    const before = beforeRanks[row.teamId] || null;
    const delta = before ? before - after : 0;
    return { teamId: row.teamId, teamName: row.teamName, before, after, delta };
  }).filter(item => item.before !== null && item.delta !== 0);

  const risers = movers.filter(m => m.delta > 0).sort((a,b) => b.delta - a.delta || a.after - b.after).slice(0, 2);
  const fallers = movers.filter(m => m.delta < 0).sort((a,b) => a.delta - b.delta || a.after - b.after).slice(0, 2);
  const bigMoverLines = [];
  const currentLeader = calcAfter.seasonStandings[0];
  const priorLeader = calcBefore?.seasonStandings?.[0];
  if (currentLeader && (!priorLeader || currentLeader.teamId !== priorLeader.teamId)) {
    bigMoverLines.push(`${currentLeader.teamName} now holds down 1st overall.`);
  }
  risers.forEach(item => bigMoverLines.push(`${item.teamName} ${rankDeltaPhrase(item.delta)} into ${item.after}${ordinal(item.after)} overall.`));
  fallers.forEach(item => bigMoverLines.push(`${item.teamName} ${rankDeltaPhrase(item.delta)} to ${item.after}${ordinal(item.after)} overall.`));
  if (!bigMoverLines.length) bigMoverLines.push('No major movement in the overall standings this week.');

  const miniSeason = getMiniSeasonByKey(week.miniSeasonKey);
  const miniStandings = calcAfter.miniSeasonStandings[week.miniSeasonKey] || [];
  let miniText = '';
  if (miniStandings.length) {
    const leader = miniStandings[0];
    const runnerUp = miniStandings[1];
    const completed = miniSeason.weeks.every(weekId => {
      const entry = calcAfter.weekly.find(w => w.id === weekId);
      return entry && entry.results.length > 0;
    });
    if (completed) {
      miniText = `${miniSeason.label} is now wrapped up, with ${leader.teamName} finishing on top.`;
    } else if (runnerUp) {
      const gap = round2(leader.countedPoints - runnerUp.countedPoints);
      miniText = `${miniSeason.label} is still tight, with ${leader.teamName} leading by ${gap} point${gap === 1 ? '' : 's'} over ${runnerUp.teamName}.`;
    } else {
      miniText = `${miniSeason.label} is underway, with ${leader.teamName} setting the pace so far.`;
    }
  }

  const kpText = week.kpWon && week.kpWinner
    ? `The KP was won by ${week.kpWinner} for ${money(week.payouts.kpPaid)}.`
    : `The KP was not won, so the carryover moves to ${money(week.payouts.kpCarryAfter)}.`;
  const holePrize = week.holeInOnePrize || money(data.settings.holeInOneDefault);

  const nextWeek = data.weeks[weekIndex + 1];
  let nextWeekText = '';
  if (nextWeek) {
    const details = [];
    if (nextWeek.mealOption) details.push(`${nextWeek.mealOption}${nextWeek.mealPrice ? ` (${nextWeek.mealPrice})` : ''}`);
    if (nextWeek.drinkSpecial) details.push(`drink special: ${nextWeek.drinkSpecial}`);
    details.push(`hole-in-one prize: ${nextWeek.holeInOnePrize || money(data.settings.holeInOneDefault)}`);
    nextWeekText = `Next week on ${fmtDate(nextWeek.date)}: ${details.join(' · ')}.`;
  }

  const tieNote = topResults.length > 1 && second && third && second.net === third.net
    ? `${teamName(data, second.teamId)} and ${teamName(data, third.teamId)} finished tied just behind the winner.`
    : topResults.length > 2
      ? `${teamName(data, second.teamId)} and ${teamName(data, third.teamId)} rounded out the podium.`
      : topResults.length > 1
        ? `${teamName(data, second.teamId)} was right there in the chase as well.`
        : '';

  const lines = [
    `Week ${week.id.replace('W','')} Recap — ${fmtDate(week.date)}`,
    '',
    `${teamName(data, winner.teamId)} took top spot this week with a net ${winner.net}, built from a gross ${winner.gross} and handicap ${winner.handicap}. ${tieNote}`.trim(),
    '',
    'Weekly payouts:',
    payoutLines,
    '',
    `${kpText} The hole-in-one prize sat at ${holePrize}.`,
    '',
    'Big Movers This Week:',
    ...bigMoverLines.map(line => `- ${line}`),
    '',
    miniText,
  ];
  if (nextWeekText) lines.push('', nextWeekText);
  return lines.join('\n').trim();
}

function tableHTML(headers, rows){
  const head = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const body = rows.length ? rows.map(row => `<tr>${row.map((cell, idx) => `<td data-label="${escapeAttr(headers[idx])}">${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="subdued">No data yet.</td></tr>`;
  return `<div class="table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`;
}

function payoutLines(rows){
  return rows.map(r => `<div class="row-label"><span>${r.place}${ordinal(r.place)}</span><strong>${money(r.amount)}</strong></div>`).join('');
}

function renderPublic(data){
  const calc = calculateLeague(data);
  $('courseName').textContent = data.settings.courseName;
  $('title').textContent = data.settings.leagueName;
  $('subtitle').textContent = 'Mobile-first public leaderboard, pairings, payouts, and season standings.';

  $('payoutBreakdowns').innerHTML = [
    ...MINI_SEASONS.map(ms => {
      const weekDates = ms.weeks.map(id => getWeek(data, id)?.date).filter(Boolean);
      const payoutInfo = calc.miniSeasonPayoutRows[ms.key];
      const rows = payoutInfo.baseRows;
      const standings = calc.miniSeasonStandings[ms.key] || [];
      const completed = ms.weeks.every(weekId => {
        const w = calc.weekly.find(entry => entry.id === weekId);
        return w && w.results.length > 0;
      });
      return `<div class="card third breakdown-card">
        <div class="eyebrow">Payout Breakdown</div>
        <h2>${ms.label}</h2>
        <div class="subdued">${fmtDate(weekDates[0])} – ${fmtDate(weekDates[weekDates.length - 1])}</div>
        <div class="row-labels">
          <div class="row-label"><span>Current pot</span><strong>${money(calc.miniSeasonPots[ms.key] || 0)}</strong></div>
          ${payoutLines(rows)}
          <div class="row-label"><span>Drop score</span><strong>${ms.drop ? 'Drop worst of 4' : 'No'}</strong></div>
          <div class="row-label"><span>${completed ? 'Winner' : 'Leader'}</span><strong>${standings[0]?.teamName || 'No rounds yet'}</strong></div>
        </div>
      </div>`;
    }),
    `<div class="card third breakdown-card">
      <div class="eyebrow">Payout Breakdown</div>
      <h2>Year-End</h2>
      <div class="subdued">Starts at $0 until real money is entered</div>
      <div class="row-labels">
        <div class="row-label"><span>Current purse</span><strong>${money(calc.yearEndPurse)}</strong></div>
        ${payoutLines(calc.projectedYearEndRows)}
        <div class="row-label"><span>Season Leader</span><strong>${calc.seasonStandings[0]?.teamName || 'Not available yet'}</strong></div>
      </div>
    </div>`
  ].join('');

  const infoWeek = calc.publicPairingsWeek || calc.latestWeek;
  $('weeklyInfo').innerHTML = `
    <div class="eyebrow">This Week at Mens Night</div>
    <h2>${fmtDate(infoWeek.date)}</h2>
    <div class="row-labels">
      ${infoWeek.mealOption ? `<div class="row-label"><span>Meal</span><strong>${escapeHTML(infoWeek.mealOption)}${infoWeek.mealPrice ? ` — ${escapeHTML(infoWeek.mealPrice)}` : ''}</strong></div>` : ''}
      ${infoWeek.mealOption ? `<div class="row-label"><span>Meal note</span><strong>Buy meal ticket at registration</strong></div>` : ''}
      ${infoWeek.drinkSpecial ? `<div class="row-label"><span>Drink Special</span><strong>${escapeHTML(infoWeek.drinkSpecial)}</strong></div>` : ''}
      <div class="row-label"><span>Hole-In-One Prize</span><strong>${escapeHTML(infoWeek.holeInOnePrize || money(data.settings.holeInOneDefault))}</strong></div>
      ${infoWeek.extraNote ? `<div class="row-label"><span>Extra</span><strong>${escapeHTML(infoWeek.extraNote)}</strong></div>` : ''}
      ${!infoWeek.mealOption && !infoWeek.drinkSpecial && !infoWeek.extraNote ? `<div class="note">Weekly meal, drink specials, and prize info will show here as soon as they are entered.</div>` : ''}
    </div>`;

  const latest = calc.latestCompletedWeek;
  $('weeklyPayouts').innerHTML = `
    <div class="eyebrow">Weekly Payouts</div>
    <h2>${latest ? `${latest.id} — ${fmtDate(latest.date)}` : 'No results yet'}</h2>
    ${latest ? `<div class="row-labels">
      <div class="row-label"><span>Weekly pot</span><strong>${money(latest.payouts.weeklyPool)}</strong></div>
      ${latest.payouts.weeklyAwardRows.map(row => `<div class="row-label"><span>${row.displayPlace}</span><strong>${money(row.amount)}</strong></div>`).join('')}
      <div class="row-label"><span>KP</span><strong>${latest.kpWon ? escapeHTML(latest.kpWinner || 'Won this week') : `Carryover: ${money(latest.payouts.kpCarryAfter)}`}</strong></div>
    </div>` : `<div class="note">Enter scores and attendance from admin to populate weekly payouts.</div>`}`;

  $('lastWeekPayouts').innerHTML = `
    <div class="eyebrow">Last Week Team Payouts</div>
    <h2>${latest ? `${latest.id} — ${fmtDate(latest.date)}` : 'No results yet'}</h2>
    ${latest ? tableHTML(['Place','Team','Net','Points','Payout'], latest.payouts.weeklyAwardRows.map(row => {
      const result = latest.results.find(item => item.teamId === row.teamId);
      return [
        row.displayPlace,
        escapeHTML(teamName(data, row.teamId)),
        result?.net ?? '—',
        result?.points ?? '—',
        money(row.amount)
      ];
    })) : `<div class="note">Weekly podium payouts will show here after scores are entered.</div>`}`;

  $('pairingsSection').innerHTML = `
    <div class="section-title"><h2>Weekly Pairings</h2><span class="badge ${computeStatus(infoWeek).className}">${computeStatus(infoWeek).label}</span></div>
    <p class="subdued">Showing ${fmtDate(infoWeek.date)} · ${getMiniSeasonByKey(infoWeek.miniSeasonKey).label}</p>
    ${weekHasPairings(infoWeek) ? tableHTML(['Hole','Team 1','Team 2'], infoWeek.pairings.filter(p => p.teamA || p.teamB).map(p => [escapeHTML(String(p.hole ?? '')), escapeHTML(teamName(data, p.teamA)), escapeHTML(teamName(data, p.teamB))])) : '<div class="note">Pairings not published yet.</div>'}`;

  $('leaderboardSection').innerHTML = `
    <h2>Last Week Leaderboard</h2>
    <p class="subdued">${latest ? `Results from ${latest.id} — ${fmtDate(latest.date)}.` : 'No completed week yet.'}</p>
    ${latest ? tableHTML(['Place','Team','Gross','HDCP','Net','Points'], latest.results.slice(0,10).map((row, idx) => [idx + 1, escapeHTML(teamName(data, row.teamId)), row.gross, row.handicap, row.net, row.points])) : '<div class="note">No weekly scores entered yet.</div>'}`;

  $('preseasonStandings').innerHTML = `
    <h2>Mini Season 1 — Preseason Standings</h2>
    <p class="subdued">3 weeks. No dropped score. Counts for preseason payout and handicap building, but not the year-end race.</p>
    ${tableHTML(['Rank','Team','Points','Dropped?'], calc.preseasonStandings.map(row => [row.rank, escapeHTML(row.teamName), row.countedPoints, row.droppedWeekId ? row.droppedWeekId : 'No']))}`;

  $('miniSeasonStandings').innerHTML = MINI_SEASONS.filter(ms => ms.key !== 'preseason').map(ms => {
    const standings = calc.miniSeasonStandings[ms.key] || [];
    return `<div class="card half">
      <h2>${ms.label}</h2>
      <p class="subdued">Worst week is dropped once a team has at least 2 scores in this mini season. Dropped week is also excluded from year-end points.</p>
      ${tableHTML(['Rank','Team','Counted Pts','Gross Pts','Dropped Week'], standings.map(row => [row.rank, escapeHTML(row.teamName), row.countedPoints, row.rawPoints, row.droppedWeekId || '—']))}
    </div>`;
  }).join('');

  $('seasonStandings').innerHTML = `
    <h2>Official Season Standings</h2>
    <p class="subdued">Only Mini Seasons 2–5 count here. Dropped mini-season weeks are also excluded from the year-end race.</p>
    ${tableHTML(['Rank','Team','Points','Gross Pts','HDCP','Current Winnings $','Projected Year-End $'], calc.seasonStandings.map(row => [row.rank, escapeHTML(row.teamName), row.points, row.grossPoints, row.handicap, money(row.currentWinnings), money(row.projectedYearEnd)]))}`;
}

function renderHelperBox(){
  $('helperBox').innerHTML = `
    <h2>Weekly Workflow</h2>
    <div class="helper-grid">
      <div class="note">
        <strong>Before league</strong>
        <ol class="listless">
          <li>Select the week</li>
          <li>Generate pairings</li>
          <li>Adjust if needed</li>
          <li>Publish pairings</li>
          <li>Export JSON to make them live</li>
        </ol>
      </div>
      <div class="note">
        <strong>After league</strong>
        <ol class="listless">
          <li>Return to the same week</li>
          <li>Enter attendance, money, meal, and KP</li>
          <li>Enter team gross scores</li>
          <li>Save this week</li>
          <li>Export JSON again to update the public page</li>
        </ol>
      </div>
    </div>
    <p class="footer-note">Every save and export creates an automatic browser backup. “Restore Previous Backup” restores the selected week on this computer and browser.</p>`;
}

function renderAdmin(data){
  const calc = calculateLeague(data);
  $('adminTitle').textContent = `${data.settings.courseName} — Admin`;
  renderHelperBox();
  const app = $('adminApp');
  const currentWeekIndex = Number(app.dataset.weekIndex || 0);
  const selectedWeekIndex = clamp(currentWeekIndex, 0, data.weeks.length - 1);
  const selectedWeek = data.weeks[selectedWeekIndex];
  const selectedStatus = computeStatus(selectedWeek);

  app.innerHTML = `
    <section class="card">
      <div class="section-title"><h2>League Setup</h2><span class="badge">12-team base ready</span></div>
      <div class="field-grid">
        ${textInput('Course Name','setting-courseName',data.settings.courseName)}
        ${textInput('League Name','setting-leagueName',data.settings.leagueName)}
        ${textInput('Admin Password','setting-adminPassword',data.settings.adminPassword)}
        ${numberInput('Year-End Collected (one-time total)','yearEndCollected',data.yearEndCollected, '0.01')}
        ${numberInput('Weekly payout / player','setting-weeklyPayoutPerPlayer',data.settings.weeklyPayoutPerPlayer, '0.01')}
        ${numberInput('KP / player','setting-kpPerPlayer',data.settings.kpPerPlayer, '0.01')}
        ${numberInput('Mini season / player','setting-miniSeasonPerPlayer',data.settings.miniSeasonPerPlayer, '0.01')}
        ${numberInput('Season buy-in / player','setting-seasonBuyInPerPlayer',data.settings.seasonBuyInPerPlayer, '0.01')}
        ${numberInput('Preseason max handicap move','setting-preseasonMaxChange',data.settings.preseasonMaxChange, '1')}
        ${numberInput('In-season max handicap move','setting-inSeasonMaxChange',data.settings.inSeasonMaxChange, '1')}
        ${numberInput('Max handicap','setting-maxHandicap',data.settings.maxHandicap, '1')}
        ${textInput('Default hole-in-one prize','setting-holeInOneDefault',data.settings.holeInOneDefault)}
      </div>
    </section>

    <section class="card">
      <div class="section-title"><h2>Quick Summary</h2></div>
      <div class="kpi-grid">
        <div class="card"><div class="subdued">Season Leader</div><div class="kpi-value">${escapeHTML(calc.seasonStandings[0]?.teamName || '—')}</div></div>
        <div class="card"><div class="subdued">Current Year-End Purse</div><div class="kpi-value">${money(calc.yearEndPurse)}</div></div>
        <div class="card"><div class="subdued">Current KP Carry</div><div class="kpi-value">${money(calc.kpCarry)}</div></div>
        <div class="card"><div class="subdued">Latest Completed Week</div><div class="kpi-value">${calc.latestCompletedWeek ? calc.latestCompletedWeek.id : '—'}</div></div>
      </div>
    </section>

    <section class="card">
      <div class="section-title"><h2>Teams</h2><button id="addTeamBtn">Add Team</button></div>
      ${tableHTML(['ID','Team Name','Player 1','Player 2','Player 3','Player 4','Actions'], data.teams.map((team, idx) => [
        team.id,
        `<input data-team-name="${idx}" value="${escapeAttr(team.name)}">`,
        ...[0,1,2,3].map(i => `<input data-team-player="${idx}:${i}" value="${escapeAttr(team.players[i] || '')}">`),
        `<button class="danger small" data-remove-team="${team.id}">Remove</button>`
      ]))}
    </section>

    <section class="card">
      <div class="section-title"><h2>Weekly Editor</h2></div>
      <div class="week-nav">
        <button id="prevWeekBtn" class="secondary">← Previous Week</button>
        <label>Selected week
          <select id="weekPicker">${data.weeks.map((week, idx) => {
            const status = computeStatus(week).label;
            return `<option value="${idx}" ${idx === selectedWeekIndex ? 'selected' : ''}>${week.id} · ${fmtDate(week.date)} · ${getMiniSeasonByKey(week.miniSeasonKey).short} · ${status}</option>`;
          }).join('')}</select>
        </label>
        <button id="nextWeekBtn" class="secondary">Next Week →</button>
        <button id="resetSeasonBtn" class="danger">Reset Season (Keep Teams)</button>
      </div>
      <div class="week-status-line">
        <span class="badge ${selectedStatus.className}">Week status ${selectedStatus.label}</span>
        <span class="badge">Published ${selectedWeek.pairingsPublished ? 'Yes' : 'No'}</span>
        <span class="badge">${getMiniSeasonByKey(selectedWeek.miniSeasonKey).label}</span>
      </div>

      <div class="main-stack top-gap" id="weekEditorShell">
        ${renderWeekEditorHTML(data, selectedWeekIndex, calc)}
      </div>
    </section>
  `;
  app.dataset.weekIndex = String(selectedWeekIndex);
  bindAdminEvents(data);
}

function renderWeekEditorHTML(data, weekIndex, calc){
  const week = data.weeks[weekIndex];
  const status = computeStatus(week);
  const teams = activeTeams(data);
  const eligibleSeasonStandings = calc.seasonStandings.map(row => row.teamId);
  return `
    <div class="card">
      <div class="section-title"><h3>Step 1 — Pairings</h3><span class="badge ${status.className}">${status.label}</span></div>
      <p class="subdued">Generate pairings first, then publish them. Public page updates only after you export the JSON file.</p>
      <div class="toolbar">
        <button id="generatePairingsBtn">Generate Nearby Random Pairings</button>
        <button id="publishPairingsBtn" class="gold">Publish Pairings</button>
        <button id="restoreWeekBtn" class="secondary">Restore Previous Backup</button>
      </div>
      ${tableHTML(['Hole','Team 1','Team 2'], week.pairings.map((pair, idx) => [
        `<input id="pairingHole-${idx}" value="${escapeAttr(String(pair.hole ?? ''))}" placeholder="1">`,
        teamSelectHTML(data, `pairingA-${idx}`, pair.teamA),
        teamSelectHTML(data, `pairingB-${idx}`, pair.teamB)
      ]))}
    </div>

    <div class="card">
      <div class="section-title"><h3>Step 2 — Attendance, Money & Weekly Info</h3></div>
      <div class="small-grid">
        ${numberInput('Attendance players','week-attendancePlayers',week.attendancePlayers,'1')}
        ${numberInput('Weekly extra money','week-weeklyExtraMoney',week.weeklyExtraMoney,'0.01')}
        ${numberInput('Mini season extra money','week-miniSeasonExtraMoney',week.miniSeasonExtraMoney,'0.01')}
        ${numberInput('Year-end extra money','week-yearEndExtraMoney',week.yearEndExtraMoney,'0.01')}
        ${numberInput('Square net amount','week-squareNetAmount',week.squareNetAmount,'0.01')}
        <label>Square net allocation<select id="week-squareAllocation"><option value="split" ${week.squareAllocation === 'split' ? 'selected' : ''}>Split mini season + year-end</option><option value="mini-season" ${week.squareAllocation === 'mini-season' ? 'selected' : ''}>Mini season only</option><option value="year-end" ${week.squareAllocation === 'year-end' ? 'selected' : ''}>Year-end only</option></select></label>
        ${textInput('Meal option','week-mealOption',week.mealOption)}
        ${textInput('Meal price','week-mealPrice',week.mealPrice)}
        ${textInput('Drink special','week-drinkSpecial',week.drinkSpecial)}
        ${textInput('Hole-in-one prize','week-holeInOnePrize',week.holeInOnePrize)}
        ${textInput('KP winner','week-kpWinner',week.kpWinner)}
        <label>KP won this week?<select id="week-kpWon"><option value="no" ${week.kpWon ? '' : 'selected'}>No</option><option value="yes" ${week.kpWon ? 'selected' : ''}>Yes</option></select></label>
      </div>
      <label class="top-gap">Extra weekly note
        <textarea id="week-extraNote">${escapeHTML(week.extraNote)}</textarea>
      </label>
    </div>

    <div class="card">
      <div class="section-title"><h3>Step 3 — Scores</h3></div>
      <p class="subdued">Enter gross team scores. Net is calculated automatically as gross minus handicap.</p>
      ${tableHTML(['Team','Gross Score'], teams.map(team => [escapeHTML(team.name), `<input type="number" step="1" id="score-${team.id}" value="${escapeAttr(week.scores[team.id] ?? '')}">`]))}
    </div>

    <div class="card">
      <div class="section-title"><h3>Step 4 — Save & Publish</h3></div>
      <div class="toolbar">
        <button id="saveWeekBtn">Save This Week</button>
        <button id="exportBtn" class="gold">Export league-data.json</button>
        <button id="weeklyAuditBtn" class="secondary">Generate Weekly Audit Report</button>
        <label class="button secondary" for="importJson">Import JSON</label>
        <input id="importJson" type="file" accept="application/json" class="hidden">
      </div>
      <p class="footer-note">Every Save and Export creates an automatic backup in this browser.</p>
    </div>

    <div class="card">
      <div class="section-title"><h3>Step 5 — Weekly Recap Generator</h3></div>
      <p class="subdued">Build a slightly fun recap for the selected week, including payouts, KP, big movers, and next week's feature.</p>
      <div class="toolbar">
        <button id="generateRecapBtn">Generate Weekly Recap</button>
        <button id="copyRecapBtn" class="secondary">Copy Recap</button>
      </div>
      <label class="top-gap">Editable recap text
        <textarea id="weeklyRecapText" class="recap-text" placeholder="Generate a recap after scores are entered for this week."></textarea>
      </label>
      <p class="footer-note">This text is for copy/paste only. It is editable here and does not change your live website unless you choose to post it somewhere.</p>
    </div>`;
}

function textInput(label, id, value){
  return `<label>${label}<input id="${id}" value="${escapeAttr(value ?? '')}"></label>`;
}
function numberInput(label, id, value, step){
  return `<label>${label}<input type="number" step="${step}" id="${id}" value="${escapeAttr(value ?? 0)}"></label>`;
}
function teamSelectHTML(data, id, selected){
  return `<select id="${id}"><option value="">—</option>${activeTeams(data).map(team => `<option value="${team.id}" ${team.id === selected ? 'selected' : ''}>${escapeHTML(team.name)}</option>`).join('')}</select>`;
}

function updateDataFromAdminInputs(data, weekIndex){
  const week = data.weeks[weekIndex];
  data.settings.courseName = $('setting-courseName').value.trim();
  data.settings.leagueName = $('setting-leagueName').value.trim();
  data.settings.adminPassword = $('setting-adminPassword').value.trim();
  data.settings.weeklyPayoutPerPlayer = number($('setting-weeklyPayoutPerPlayer').value);
  data.settings.kpPerPlayer = number($('setting-kpPerPlayer').value);
  data.settings.miniSeasonPerPlayer = number($('setting-miniSeasonPerPlayer').value);
  data.settings.seasonBuyInPerPlayer = number($('setting-seasonBuyInPerPlayer').value);
  data.settings.preseasonMaxChange = number($('setting-preseasonMaxChange').value);
  data.settings.inSeasonMaxChange = number($('setting-inSeasonMaxChange').value);
  data.settings.maxHandicap = number($('setting-maxHandicap').value);
  data.settings.holeInOneDefault = $('setting-holeInOneDefault').value.trim();
  data.yearEndCollected = number($('yearEndCollected').value);

  data.teams.forEach((team, idx) => {
    team.name = document.querySelector(`[data-team-name="${idx}"]`)?.value.trim() || '';
    team.players = [0,1,2,3].map(i => document.querySelector(`[data-team-player="${idx}:${i}"]`)?.value.trim() || '');
  });

  week.attendancePlayers = number($('week-attendancePlayers').value);
  week.weeklyExtraMoney = number($('week-weeklyExtraMoney').value);
  week.miniSeasonExtraMoney = number($('week-miniSeasonExtraMoney').value);
  week.yearEndExtraMoney = number($('week-yearEndExtraMoney').value);
  week.squareNetAmount = number($('week-squareNetAmount').value);
  week.squareAllocation = $('week-squareAllocation').value;
  week.mealOption = $('week-mealOption').value.trim();
  week.mealPrice = $('week-mealPrice').value.trim();
  week.drinkSpecial = $('week-drinkSpecial').value.trim();
  week.holeInOnePrize = $('week-holeInOnePrize').value.trim();
  week.kpWinner = $('week-kpWinner').value.trim();
  week.kpWon = $('week-kpWon').value === 'yes';
  week.extraNote = $('week-extraNote').value.trim();

  activeTeams(data).forEach(team => {
    const input = $(`score-${team.id}`);
    if (!input) return;
    const raw = input.value.trim();
    if (raw === '') delete week.scores[team.id];
    else week.scores[team.id] = Number(raw);
  });

  week.pairings = week.pairings.map((pair, idx) => ({
    hole: $(`pairingHole-${idx}`).value.trim() || pair.hole,
    teamA: $(`pairingA-${idx}`).value,
    teamB: $(`pairingB-${idx}`).value,
  }));
}

function bindAdminEvents(data){
  const app = $('adminApp');
  const statusEl = $('saveStatus');
  const weekPicker = $('weekPicker');
  const weekIndex = Number(weekPicker.value);

  function rerender(message){
    saveLocal(data);
    renderAdmin(data);
    $('saveStatus').textContent = message || '';
  }

  $('prevWeekBtn').onclick = () => { app.dataset.weekIndex = String(Math.max(0, Number(weekPicker.value) - 1)); updateDataFromAdminInputs(data, weekIndex); renderAdmin(data); };
  $('nextWeekBtn').onclick = () => { app.dataset.weekIndex = String(Math.min(data.weeks.length - 1, Number(weekPicker.value) + 1)); updateDataFromAdminInputs(data, weekIndex); renderAdmin(data); };
  weekPicker.onchange = () => { updateDataFromAdminInputs(data, weekIndex); app.dataset.weekIndex = weekPicker.value; renderAdmin(data); };

  $('addTeamBtn').onclick = () => {
    updateDataFromAdminInputs(data, weekIndex);
    const next = data.teams.length + 1;
    data.teams.push({ id: `T${next}`, name: `Team ${next}`, players: ['', '', '', ''] });
    saveBackup(data, 'Add team');
    rerender('Team added.');
  };

  document.querySelectorAll('[data-remove-team]').forEach(btn => {
    btn.onclick = () => {
      updateDataFromAdminInputs(data, weekIndex);
      const teamId = btn.dataset.removeTeam;
      const team = data.teams.find(t => t.id === teamId);
      if (!team) return;
      data.weeks.forEach(week => {
        delete week.scores[teamId];
        week.pairings = week.pairings.map(pair => ({ ...pair, teamA: pair.teamA === teamId ? '' : pair.teamA, teamB: pair.teamB === teamId ? '' : pair.teamB }));
      });
      team.name = '';
      team.players = ['', '', '', ''];
      saveBackup(data, `Remove ${teamId}`);
      rerender(`${teamId} removed.`);
    };
  });

  $('generatePairingsBtn').onclick = () => {
    updateDataFromAdminInputs(data, weekIndex);
    generatePairingsForWeek(data, weekIndex);
    rerender(`Pairings generated for ${data.weeks[weekIndex].id}.`);
  };

  $('publishPairingsBtn').onclick = () => {
    updateDataFromAdminInputs(data, weekIndex);
    data.weeks[weekIndex].pairingsPublished = true;
    saveBackup(data, `Publish pairings ${data.weeks[weekIndex].id}`);
    rerender(`Pairings published for ${data.weeks[weekIndex].id}. Export JSON to make them live.`);
  };

  $('restoreWeekBtn').onclick = () => {
    updateDataFromAdminInputs(data, weekIndex);
    const restored = restoreWeekFromBackup(data, data.weeks[weekIndex].id);
    if (!restored) {
      statusEl.textContent = 'No backup found yet for that week.';
      return;
    }
    Object.assign(data, restored);
    saveLocal(data);
    renderAdmin(data);
    $('saveStatus').textContent = `Restored backup for ${data.weeks[weekIndex].id}.`;
  };

  $('saveWeekBtn').onclick = () => {
    updateDataFromAdminInputs(data, weekIndex);
    saveBackup(data, `Save ${data.weeks[weekIndex].id}`);
    rerender(`Saved ${data.weeks[weekIndex].id} in this browser.`);
  };

  $('exportBtn').onclick = () => {
    updateDataFromAdminInputs(data, weekIndex);
    saveBackup(data, `Export ${data.weeks[weekIndex].id}`);
    saveLocal(data);
    downloadData(data);
    renderAdmin(data);
    $('saveStatus').textContent = `Exported league-data.json. Upload it to update the live site.`;
  };

  $('weeklyAuditBtn').onclick = () => {
    updateDataFromAdminInputs(data, weekIndex);
    saveBackup(data, `Weekly audit report ${data.weeks[weekIndex].id}`);
    saveLocal(data);
    const ok = downloadWeeklyAuditReport(data, weekIndex);
    renderAdmin(data);
    $('saveStatus').textContent = ok ? `Weekly audit report downloaded for ${data.weeks[weekIndex].id}.` : 'Unable to generate weekly audit report for that week.';
  };

  $('generateRecapBtn').onclick = () => {
    updateDataFromAdminInputs(data, weekIndex);
    const recap = buildWeeklyRecap(data, weekIndex);
    $('weeklyRecapText').value = recap || 'Enter scores for this week first, then generate the recap.';
    statusEl.textContent = recap ? `Weekly recap generated for ${data.weeks[weekIndex].id}.` : 'No completed scores found for that week yet.';
  };

  $('copyRecapBtn').onclick = async () => {
    const text = $('weeklyRecapText').value.trim();
    if (!text) {
      statusEl.textContent = 'Generate the recap first.';
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      statusEl.textContent = 'Weekly recap copied.';
    } catch (err) {
      $('weeklyRecapText').select();
      document.execCommand('copy');
      statusEl.textContent = 'Weekly recap copied.';
    }
  };

  $('importJson').onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const incoming = normalizeData(JSON.parse(text));
    saveBackup(incoming, 'Import JSON');
    saveLocal(incoming);
    renderAdmin(incoming);
    $('saveStatus').textContent = 'Imported JSON into this browser.';
  };

  $('resetSeasonBtn').onclick = () => {
    if (!confirm('Reset all weeks, scores, money, and pairings while keeping the current teams?')) return;
    updateDataFromAdminInputs(data, weekIndex);
    saveBackup(data, 'Reset season before wipe');
    const fresh = normalizeData(DEFAULT_DATA);
    fresh.teams = clone(data.teams);
    fresh.settings = { ...fresh.settings, ...data.settings };
    data.weeks = fresh.weeks;
    data.yearEndCollected = 0;
    saveLocal(data);
    renderAdmin(data);
    $('saveStatus').textContent = 'Season reset. Teams kept. Export the JSON when ready.';
  };
}

function generatePairingsForWeek(data, weekIndex){
  const calc = calculateLeague(data);
  const week = data.weeks[weekIndex];
  const active = activeTeams(data).filter(t => t.name);
  const ranking = calc.seasonStandings.map(row => row.teamId);
  const weightedList = active.slice().sort((a,b) => {
    const ai = ranking.indexOf(a.id); const bi = ranking.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  const groups = [];
  const pool = weightedList.slice();
  while (pool.length > 1) {
    const team = pool.shift();
    const nearest = pool.splice(Math.min(Math.floor(Math.random() * Math.min(3, pool.length || 1)), pool.length - 1), 1)[0];
    groups.push([team, nearest]);
  }
  if (pool.length) groups.push([pool.shift(), null]);
  week.pairings = Array.from({ length: 8 }, (_, i) => ({ hole: i + 1, teamA: groups[i]?.[0]?.id || '', teamB: groups[i]?.[1]?.id || '' }));
  week.pairingsPublished = false;
}

function initAdmin(){
  renderHelperBox();
  $('unlockBtn').onclick = async () => {
    const data = await loadData(true);
    const input = $('adminPasswordInput').value.trim();
    if (input !== data.settings.adminPassword) {
      $('gateStatus').textContent = 'Incorrect password.';
      return;
    }
    setUnlocked(true);
    $('gate').classList.add('hidden');
    $('adminPanel').classList.remove('hidden');
    renderAdmin(data);
  };
  $('lockBtn')?.addEventListener('click', () => {
    setUnlocked(false);
    location.reload();
  });
  if (isUnlocked()) {
    loadData(true).then(data => {
      $('gate').classList.add('hidden');
      $('adminPanel').classList.remove('hidden');
      renderAdmin(data);
      $('lockBtn').onclick = () => { setUnlocked(false); location.reload(); };
    });
  }
}

function initPublic(){ loadData(false).then(renderPublic); }

window.MensNightLeague = { initPublic, initAdmin };
})();
