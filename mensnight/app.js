(function(){
const DATA_FILE = 'league-data.json';
const STORAGE_KEY = 'mensLeagueAdminData_v2';
const SESSION_KEY = 'mensLeagueAdminUnlocked_v2';

const defaultData = {
  settings: {
    leagueName: '2026 Mens Night League',
    courseName: 'Vegreville Kinsmen Golf Club',
    adminPassword: 'mens2026',
    weeklyPayoutPerPlayer: 7.5,
    kpPerPlayer: 2.5,
    segmentPerPlayer: 5,
    seasonBuyInPerPlayer: 100,
    weeklySplit: [0.45, 0.30, 0.25],
    segmentSplit: [0.5, 0.3, 0.2],
    yearEndSplit: [0.4, 0.3, 0.2, 0.1],
    squareSegmentPct: 0.5,
    squareYearEndPct: 0.5,
    squareDefaultRevenue: 400,
    squareDefaultPrizeCost: 300,
    maxHandicap: 6,
    maxIncreasePerWeek: 2
  },
  teams: Array.from({length: 16}, (_, i) => ({
    id: `T${i+1}`,
    name: `Team ${i+1}`,
    players: ['', '', '', '']
  })),
  weeks: [
    makeWeek('W1','2026-05-05','Preseason', false, false),
    makeWeek('W2','2026-05-12','Preseason', false, false),
    makeWeek('W3','2026-05-19','Preseason', false, false),
    makeWeek('W4','2026-05-26','Segment 1', true, true),
    makeWeek('W5','2026-06-02','Segment 1', true, true),
    makeWeek('W6','2026-06-09','Segment 1', true, true),
    makeWeek('W7','2026-06-16','Segment 1', true, true),
    makeWeek('W8','2026-06-23','Segment 2', true, true),
    makeWeek('W9','2026-06-30','Segment 2', true, true),
    makeWeek('W10','2026-07-07','Segment 2', true, true),
    makeWeek('W11','2026-07-14','Segment 2', true, true),
    makeWeek('W12','2026-07-21','Segment 3', true, true),
    makeWeek('W13','2026-07-28','Segment 3', true, true),
    makeWeek('W14','2026-08-04','Segment 3', true, true),
    makeWeek('W15','2026-08-11','Segment 3', true, true),
    makeWeek('W16','2026-08-18','Segment 4', true, true),
    makeWeek('W17','2026-08-25','Segment 4', true, true),
    makeWeek('W18','2026-09-01','Segment 4', true, true),
    makeWeek('W19','2026-09-08','Segment 4', true, true)
  ]
};

function makeWeek(id, date, segment, officialSeason, dropLowestEligible){
  return {
    id, date, segment, officialSeason, dropLowestEligible,
    attendancePlayers: 0,
    squareRevenue: 400,
    squarePrizeCost: 300,
    sponsorSegment: 0,
    sponsorYearEnd: 0,
    kpWon: false,
    kpWinner: '',
    notes: '',
    scores: {},
    pairings: Array.from({length: 8}, (_, i) => ({ hole: i+1, teamA: '', teamB: '' }))
  };
}

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

function activeTeams(data){
  return data.teams.filter(t => t.name && t.name.trim());
}

function nextTeamId(data){
  const nums = data.teams.map(t => Number(String(t.id||'').replace(/\D/g,''))).filter(Number.isFinite);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `T${next}`;
}

function addTeam(data){
  const nextNum = data.teams.length + 1;
  const team = { id: nextTeamId(data), name: `Team ${nextNum}`, players: ['', '', '', ''] };
  data.teams.push(team);
  data.weeks.forEach(w => { if (!w.scores) w.scores = {}; w.scores[team.id] = ''; });
}

function calcLeague(data){
  const teams = activeTeams(data);
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const history = {};
  teams.forEach(t => history[t.id] = { raws: [], handicapsApplied: [], seasonPoints: 0, preseasonPoints: 0, segmentPoints: {}, segmentWeeklyPoints: {} });
  const weeklyResults = [];
  let kpCarry = 0;
  let yearEndExtra = 0;
  const segmentFunds = {};

  data.weeks.forEach((week, weekIndex) => {
    const scored = teams.map(team => {
      const gross = parseNumber(week.scores[team.id]);
      return Number.isFinite(gross) ? { teamId: team.id, gross } : null;
    }).filter(Boolean);

    const bestGross = scored.length ? Math.min(...scored.map(x => x.gross)) : null;
    const results = scored.map(item => {
      const prevApplied = history[item.teamId].handicapsApplied.length ? history[item.teamId].handicapsApplied[history[item.teamId].handicapsApplied.length - 1] : 0;
      const appliedHandicap = weekIndex === 0 ? 0 : (() => {
        const priorRaws = history[item.teamId].raws;
        if (!priorRaws.length) return 0;
        const target = roundNearest(avg(priorRaws));
        return target > prevApplied ? Math.min(target, prevApplied + data.settings.maxIncreasePerWeek) : target;
      })();
      const net = item.gross - appliedHandicap;
      const rawDiff = bestGross === null ? 0 : clamp(item.gross - bestGross, 0, data.settings.maxHandicap);
      return { ...item, handicap: clamp(appliedHandicap, 0, data.settings.maxHandicap), net, rawDiff };
    });

    awardPoints(results);

    results.forEach(r => {
      history[r.teamId].handicapsApplied.push(r.handicap);
      history[r.teamId].raws.push(r.rawDiff);
      if (week.officialSeason) {
        history[r.teamId].seasonPoints += r.points;
        history[r.teamId].segmentPoints[week.segment] = (history[r.teamId].segmentPoints[week.segment] || 0) + r.points;
        history[r.teamId].segmentWeeklyPoints[week.segment] = history[r.teamId].segmentWeeklyPoints[week.segment] || [];
        history[r.teamId].segmentWeeklyPoints[week.segment].push(r.points);
      } else {
        history[r.teamId].preseasonPoints += r.points;
      }
    });

    const players = parseNumber(week.attendancePlayers) || 0;
    const weeklyPool = players * data.settings.weeklyPayoutPerPlayer;
    const kpPool = players * data.settings.kpPerPlayer;
    const segmentBase = players * data.settings.segmentPerPlayer;
    const squareRevenue = parseNumber(week.squareRevenue) || 0;
    const squarePrizeCost = parseNumber(week.squarePrizeCost) || 0;
    const squareLeftover = Math.max(0, squareRevenue - squarePrizeCost);
    const segmentSquareAdd = squareLeftover * data.settings.squareSegmentPct;
    const yearEndSquareAdd = squareLeftover * data.settings.squareYearEndPct;
    const sponsorSegment = parseNumber(week.sponsorSegment) || 0;
    const sponsorYearEnd = parseNumber(week.sponsorYearEnd) || 0;
    const kpAvailable = kpCarry + kpPool;
    const kpPaid = week.kpWon ? kpAvailable : 0;
    kpCarry = week.kpWon ? 0 : kpAvailable;

    if (week.officialSeason) {
      segmentFunds[week.segment] = (segmentFunds[week.segment] || 0) + segmentBase + segmentSquareAdd + sponsorSegment;
      yearEndExtra += yearEndSquareAdd + sponsorYearEnd;
    }

    const rosteredPlayersSoFar = teams.reduce((sum,t)=> sum + t.players.filter(p => p && String(p).trim()).length, 0);
    weeklyResults.push({
      weekId: week.id,
      date: week.date,
      segment: week.segment,
      officialSeason: week.officialSeason,
      bestGross,
      players,
      results: results.sort((a,b)=> a.net - b.net || a.gross - b.gross || a.teamId.localeCompare(b.teamId)),
      payouts: {
        weeklyPool,
        kpPool,
        kpCarryBefore: kpAvailable - kpPool,
        kpAvailable,
        kpPaid,
        kpCarryAfter: kpCarry,
        segmentBase,
        squareLeftover,
        segmentSquareAdd,
        yearEndSquareAdd,
        sponsorSegment,
        sponsorYearEnd,
        currentSegmentFund: week.officialSeason ? (segmentFunds[week.segment] || 0) : 0,
        currentYearEndPurse: (rosteredPlayersSoFar * data.settings.seasonBuyInPerPlayer) + yearEndExtra
      }
    });
  });

  const preseasonStandings = teams.map(team => ({
    teamId: team.id,
    teamName: team.name,
    points: history[team.id].preseasonPoints
  })).sort(sortStandings);
  rankStandings(preseasonStandings);

  const segments = ['Segment 1','Segment 2','Segment 3','Segment 4'];
  const segmentStandings = Object.fromEntries(segments.map(seg => [seg, teams.map(team => {
    const weeksPts = (history[team.id].segmentWeeklyPoints[seg] || []).slice();
    const dropped = weeksPts.length ? Math.min(...weeksPts) : 0;
    const total = weeksPts.reduce((a,b)=>a+b,0);
    const adjusted = weeksPts.length ? total - dropped : 0;
    return { teamId: team.id, teamName: team.name, rawPoints: total, droppedPoints: dropped, countedPoints: adjusted };
  }).sort((a,b)=> b.countedPoints - a.countedPoints || b.rawPoints - a.rawPoints || a.teamName.localeCompare(b.teamName))]));
  segments.forEach(seg => rankStandings(segmentStandings[seg], 'countedPoints'));

  const seasonStandings = teams.map(team => ({
    teamId: team.id,
    teamName: team.name,
    points: history[team.id].seasonPoints,
    currentHandicap: history[team.id].handicapsApplied.length ? history[team.id].handicapsApplied[history[team.id].handicapsApplied.length - 1] : 0
  })).sort(sortStandings);
  rankStandings(seasonStandings);

  const rosteredPlayers = teams.reduce((sum,t)=> sum + t.players.filter(p => p && String(p).trim()).length, 0);
  const yearEndBase = rosteredPlayers * data.settings.seasonBuyInPerPlayer;
  const yearEndTotal = yearEndBase + yearEndExtra;

  return {
    teams,
    weeklyResults,
    preseasonStandings,
    segmentStandings,
    seasonStandings,
    segmentFunds,
    yearEndBase,
    yearEndExtra,
    yearEndTotal,
    currentKpCarry: kpCarry,
    rosteredPlayers,
    nextWeek: nextWeekInfo(data),
    latestCompletedWeek: latestCompletedWeek(weeklyResults),
    history
  };
}

function nextWeekInfo(data){
  const today = '2026-01-01'; // neutral placeholder for static planning
  return data.weeks.find(w => true) || null;
}
function latestCompletedWeek(weeklyResults){
  const completed = weeklyResults.filter(w => w.results.length);
  return completed.length ? completed[completed.length - 1] : weeklyResults[0] || null;
}

function awardPoints(results){
  if (!results.length) return;
  results.sort((a,b)=> a.net - b.net || a.gross - b.gross || a.teamId.localeCompare(b.teamId));
  const n = results.length;
  let i = 0;
  while (i < results.length) {
    let j = i + 1;
    while (j < results.length && results[j].net === results[i].net) j++;
    const positions = [];
    for (let p = i; p < j; p++) positions.push(n - p);
    const avgPts = avg(positions);
    for (let p = i; p < j; p++) results[p].points = round2(avgPts);
    i = j;
  }
}

function sortStandings(a,b){ return (b.points ?? 0) - (a.points ?? 0) || a.teamName.localeCompare(b.teamName); }
function rankStandings(arr, key='points'){
  let lastVal = null, lastRank = 0;
  arr.forEach((row, idx) => {
    const val = row[key] ?? 0;
    row.rank = (lastVal !== null && val === lastVal) ? lastRank : idx + 1;
    lastVal = val;
    lastRank = row.rank;
  });
}
function avg(nums){ return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0; }
function roundNearest(n){ return Math.round(n); }
function round2(n){ return Math.round(n * 100) / 100; }
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function parseNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : NaN; }
function money(n){ return `$${round2(n).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`; }
function fmtDate(d){ return new Date(d + 'T12:00:00').toLocaleDateString(undefined,{month:'short', day:'numeric', year:'numeric'}); }

async function loadData(preferLocal=false){
  if (preferLocal) {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) return JSON.parse(local);
  }
  try {
    const res = await fetch(DATA_FILE + '?v=' + Date.now());
    if (res.ok) return await res.json();
  } catch {}
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) return JSON.parse(local);
  return clone(defaultData);
}

function saveLocal(data){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2)); }
function downloadData(data){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'league-data.json'; a.click();
  URL.revokeObjectURL(url);
}

function payoutRows(pool, split){
  return split.map((pct, idx) => ({ place: idx+1, amount: round2(pool * pct) }));
}

function tableHTML(headers, rows){
  const head = `<tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const body = rows.length ? rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="note">No data yet.</td></tr>`;
  return `<table>${head}${body}</table>`;
}

function publicPage(data){
  const calc = calcLeague(data);
  document.getElementById('title').textContent = `${data.settings.courseName} — ${data.settings.leagueName}`;
  const latest = calc.latestCompletedWeek;
  const tonightWeek = data.weeks.find(w => w.pairings.some(p => p.teamA || p.teamB)) || data.weeks[0];
  const tonightCalc = calc.weeklyResults.find(w => w.weekId === tonightWeek.id) || latest || calc.weeklyResults[0] || null;
  const activeSegmentLabel = tonightCalc && tonightCalc.officialSeason ? tonightCalc.segment : 'Segment 1';
  const weeklyPoolDisplay = tonightCalc ? tonightCalc.payouts.weeklyPool : 0;
  const segmentPoolDisplay = tonightCalc ? tonightCalc.payouts.currentSegmentFund : (calc.segmentFunds[activeSegmentLabel] || 0);
  const kpDisplay = tonightCalc ? tonightCalc.payouts.kpCarryAfter : calc.currentKpCarry;
  const latestWeekLabel = latest ? `${latest.weekId} · ${fmtDate(latest.date)}` : 'No scores yet';

  const weeklyBreakdown = payoutRows(weeklyPoolDisplay, data.settings.weeklySplit);
  const segmentBreakdown = payoutRows(segmentPoolDisplay, data.settings.segmentSplit);
  const yearEndBreakdown = payoutRows(calc.yearEndTotal, data.settings.yearEndSplit);
  document.getElementById('kpis').innerHTML = [
    ["Tonight's Weekly Payouts", money(weeklyPoolDisplay), weeklyBreakdown.map(r => `P${r.place}: ${money(r.amount)}`).join(' · ')],
    [`${activeSegmentLabel} Payouts`, money(segmentPoolDisplay), segmentBreakdown.map(r => `P${r.place}: ${money(r.amount)}`).join(' · ')],
    ['Year-End Payouts', money(calc.yearEndTotal), yearEndBreakdown.map(r => `P${r.place}: ${money(r.amount)}`).join(' · ')],
    ['KP Carryover', money(kpDisplay), 'Carries until someone is inside flagstick distance'],
    ['Rostered Players', String(calc.rosteredPlayers), 'Players currently entered on team rosters'],
    ['Latest Results Week', latestWeekLabel, 'Standings re-rank automatically when scores change']
  ].map(([label,val,note]) => `<div class="card kpi summary-card"><div class="summary-label">${label}</div><div class="summary-value">${val}</div><div class="summary-note">${note}</div></div>`).join('');

    document.getElementById('tonight').innerHTML = `
      <h2>Tonight's Hole Assignments</h2>
      <p class="note">Showing ${fmtDate(tonightWeek.date)} · ${tonightWeek.segment}</p>
      ${tableHTML(['Hole','Group A','Group B'], tonightWeek.pairings.map(p => [p.hole, teamName(data,p.teamA), teamName(data,p.teamB)]))}
    `;

    document.getElementById('latestResults').innerHTML = `
      <h2>Latest Weekly Leaderboard</h2>
      <p class="note">Net scores re-rank automatically whenever scores change.</p>
      ${latest ? tableHTML(['Place','Team','Gross','Handicap','Net','Points'], latest.results.map((r, idx) => [idx+1, teamName(data,r.teamId), r.gross, r.handicap, r.net, r.points])) : '<p class="note">No scores entered yet.</p>'}
    `;

    document.getElementById('seasonStandings').innerHTML = `
      <h2>Season Standings</h2>
      ${tableHTML(['Rank','Team','Season Points','Current Handicap'], calc.seasonStandings.map(r => [r.rank, r.teamName, r.points, r.currentHandicap]))}
    `;

    document.getElementById('preseason').innerHTML = `
      <h2>Preseason Standings</h2>
      <p class="note">3-week preseason. No dropped score.</p>
      ${tableHTML(['Rank','Team','Points'], calc.preseasonStandings.map(r => [r.rank, r.teamName, r.points]))}
    `;

    const segCards = ['Segment 1','Segment 2','Segment 3','Segment 4'].map(seg => `
      <div class="card half">
        <h3>${seg}</h3>
        <p class="note">4 weeks. Lowest points week dropped for segment payout only.</p>
        ${tableHTML(['Rank','Team','Counted','Dropped','Raw'], calc.segmentStandings[seg].map(r => [r.rank, r.teamName, r.countedPoints, r.droppedPoints, r.rawPoints]))}
      </div>
    `).join('');
    document.getElementById('segments').innerHTML = segCards;

    const latestPayout = latest ? latest.payouts : { weeklyPool:0, kpAvailable:calc.currentKpCarry, segmentBase:0, squareLeftover:0 };
    document.getElementById('pots').innerHTML = `
      <h2>Payout Pots</h2>
      ${tableHTML(['Pot','Amount','Notes'], [
        ['Latest Weekly 1-2-3 Pool', money(latestPayout.weeklyPool), 'Based on attendance × weekly payout allocation'],
        ['Current KP Pot', money(calc.currentKpCarry), 'Carries until someone is within flagstick distance'],
        ['Year-End Purse', money(calc.yearEndTotal), 'Buy-ins + square board share + sponsor adds'],
        ...Object.entries(calc.segmentFunds).map(([k,v]) => [k + ' fund', money(v), 'Weekly segment portion + square share + sponsors'])
      ])}
    `;
}

function teamName(data, id){
  if (!id) return '—';
  const t = data.teams.find(x => x.id === id);
  return t ? t.name : id;
}

function adminPage(data, status){
  const app = document.getElementById('adminApp');
  const gateStatus = document.getElementById('gateStatus');
  const calc = calcLeague(data);
  document.getElementById('adminTitle').textContent = `${data.settings.courseName} — Admin`;

  const settingsCard = `
    <div class="card full">
      <h2>League Settings</h2>
      <div class="field-grid">
        ${inputField('League Name','settings.leagueName',data.settings.leagueName)}
        ${inputField('Course Name','settings.courseName',data.settings.courseName)}
        ${inputField('Admin Password','settings.adminPassword',data.settings.adminPassword,'text')}
        ${inputField('Season Buy-In / Player','settings.seasonBuyInPerPlayer',data.settings.seasonBuyInPerPlayer,'number')}
        ${inputField('Weekly Payout / Player','settings.weeklyPayoutPerPlayer',data.settings.weeklyPayoutPerPlayer,'number','0.01')}
        ${inputField('KP / Player','settings.kpPerPlayer',data.settings.kpPerPlayer,'number','0.01')}
        ${inputField('Segment / Player','settings.segmentPerPlayer',data.settings.segmentPerPlayer,'number','0.01')}
        ${inputField('Max Handicap','settings.maxHandicap',data.settings.maxHandicap,'number')}
        ${inputField('Max Handicap Increase / Week','settings.maxIncreasePerWeek',data.settings.maxIncreasePerWeek,'number')}
        ${inputField('Square % to Segment','settings.squareSegmentPct',data.settings.squareSegmentPct,'number','0.01')}
        ${inputField('Square % to Year-End','settings.squareYearEndPct',data.settings.squareYearEndPct,'number','0.01')}
      </div>
      <p class="footer-note">Password lock is basic client-side protection only. Anyone with the file and code can inspect it, so it is fine for convenience but not true security.</p>
    </div>`;

  const teamsCard = `
    <div class="card full">
      <div class="toolbar" style="justify-content:space-between; align-items:flex-end;">
        <div>
          <h2>Teams & Players</h2>
          <p class="note">Mid-season team entry is supported. New teams start at a 0 handicap and plug into weekly, segment, and season tracking from the week they join.</p>
        </div>
        <button id="addTeamBtn" class="gold">Add New Team</button>
      </div>
      ${tableHTML(['Team ID','Team Name','Player 1','Player 2','Player 3','Player 4'], data.teams.map((t,idx) => [
        t.id,
        `<input data-path="teams.${idx}.name" value="${escapeAttr(t.name)}">`,
        ...[0,1,2,3].map(p => `<input data-path="teams.${idx}.players.${p}" value="${escapeAttr(t.players[p] || '')}">`)
      ]))}
    </div>`;

  const weekOptions = data.weeks.map((w,idx)=> `<option value="${idx}">${w.id} · ${fmtDate(w.date)} · ${w.segment}</option>`).join('');
  const editorCard = `
    <div class="card full">
      <h2>Weekly Editor</h2>
      <div class="toolbar">
        <label style="min-width:320px">Choose week<select id="weekPicker">${weekOptions}</select></label>
        <button id="saveLocalBtn">Save Local</button>
        <button id="exportBtn" class="gold">Export league-data.json</button>
        <label class="button secondary" for="importFile">Import JSON</label>
        <input id="importFile" type="file" accept="application/json" class="hidden">
      </div>
      <div id="weekEditor"></div>
    </div>`;

  const summaryCard = `
    <div class="card half">
      <h2>Live Summary</h2>
      ${tableHTML(['Metric','Value'], [
        ['Rostered players', calc.rosteredPlayers],
        ['Year-end purse', money(calc.yearEndTotal)],
        ['Current KP carry', money(calc.currentKpCarry)],
        ['Latest week entered', calc.latestCompletedWeek ? calc.latestCompletedWeek.weekId : '—']
      ])}
    </div>
    <div class="card half">
      <h2>Current Season Standings</h2>
      ${tableHTML(['Rank','Team','Points','Handicap'], calc.seasonStandings.map(r => [r.rank, r.teamName, r.points, r.currentHandicap]))}
    </div>`;

  app.innerHTML = settingsCard + teamsCard + editorCard + summaryCard;
  bindInputs(data, status);
  renderWeekEditor(data, Number(document.getElementById('weekPicker').value) || 0, status);

  document.getElementById('weekPicker').addEventListener('change', e => renderWeekEditor(data, Number(e.target.value), status));
  const addTeamBtn = document.getElementById('addTeamBtn');
  if (addTeamBtn) addTeamBtn.addEventListener('click', ()=> { addTeam(data); saveLocal(data); status.textContent = 'New team added. It will start at a 0 handicap until results build its average.'; adminPage(data, status); });
  document.getElementById('saveLocalBtn').addEventListener('click', ()=> { saveLocal(data); status.textContent = 'Saved locally in this browser.'; });
  document.getElementById('exportBtn').addEventListener('click', ()=> { saveLocal(data); downloadData(data); status.textContent = 'Exported league-data.json.'; });
  document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const incoming = JSON.parse(text);
    saveLocal(incoming);
    location.reload();
  });
}

function renderWeekEditor(data, weekIndex, status){
  const week = data.weeks[weekIndex];
  const holder = document.getElementById('weekEditor');
  const teamRows = data.teams.map((t, idx) => `
    <tr>
      <td>${t.name}</td>
      <td><input type="number" step="1" data-path="weeks.${weekIndex}.scores.${t.id}" value="${escapeAttr(week.scores[t.id] ?? '')}"></td>
    </tr>`).join('');
  const pairRows = week.pairings.map((p, idx) => `
    <tr>
      <td>${p.hole}</td>
      <td>${teamSelect(`weeks.${weekIndex}.pairings.${idx}.teamA`, p.teamA, data.teams)}</td>
      <td>${teamSelect(`weeks.${weekIndex}.pairings.${idx}.teamB`, p.teamB, data.teams)}</td>
    </tr>`).join('');

  holder.innerHTML = `
    <div class="week-block">
      <h3>${week.id} · ${fmtDate(week.date)} · <span class="badge">${week.segment}</span></h3>
      <div class="field-grid">
        ${inputField('Attendance (players)', `weeks.${weekIndex}.attendancePlayers`, week.attendancePlayers, 'number')}
        ${inputField('Square revenue', `weeks.${weekIndex}.squareRevenue`, week.squareRevenue, 'number', '0.01')}
        ${inputField('Square prize cost', `weeks.${weekIndex}.squarePrizeCost`, week.squarePrizeCost, 'number', '0.01')}
        ${inputField('Sponsor add — Segment', `weeks.${weekIndex}.sponsorSegment`, week.sponsorSegment, 'number', '0.01')}
        ${inputField('Sponsor add — Year End', `weeks.${weekIndex}.sponsorYearEnd`, week.sponsorYearEnd, 'number', '0.01')}
        ${inputField('KP winner name', `weeks.${weekIndex}.kpWinner`, week.kpWinner, 'text')}
        <div><label>KP won this week?</label><select data-path="weeks.${weekIndex}.kpWon"><option value="false" ${!week.kpWon ? 'selected' : ''}>No</option><option value="true" ${week.kpWon ? 'selected' : ''}>Yes</option></select></div>
        ${inputField('Notes', `weeks.${weekIndex}.notes`, week.notes, 'text')}
      </div>
    </div>
    <div class="grid">
      <div class="card half">
        <h3>Gross Scores</h3>
        <p class="note">Enter team gross score only. Handicaps, net scores, points, and standings auto-calculate.</p>
        <table><tr><th>Team</th><th>Gross</th></tr>${teamRows}</table>
      </div>
      <div class="card half">
        <h3>Hole Assignments</h3>
        <p class="note">Two groups per hole.</p>
        <table><tr><th>Hole</th><th>Group A</th><th>Group B</th></tr>${pairRows}</table>
      </div>
    </div>
  `;
  bindInputs(data, status);
}

function teamSelect(path, selected, teams){
  return `<select data-path="${path}"><option value="">—</option>${teams.map(t => `<option value="${t.id}" ${selected===t.id?'selected':''}>${escapeHTML(t.name)}</option>`).join('')}</select>`;
}

function inputField(label, path, value, type='text', step='1'){
  return `<div><label>${label}</label><input type="${type}" ${type==='number' ? `step="${step}"` : ''} data-path="${path}" value="${escapeAttr(value ?? '')}"></div>`;
}

function bindInputs(data, status){
  document.querySelectorAll('[data-path]').forEach(el => {
    el.onchange = () => {
      const val = el.tagName === 'SELECT' ? (el.value === 'true' ? true : el.value === 'false' ? false : el.value) : (el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value);
      setPath(data, el.dataset.path, val);
      saveLocal(data);
      status.textContent = 'Saved locally. Export league-data.json when ready to publish.';
      if (document.getElementById('weekPicker')) {
        const idx = Number(document.getElementById('weekPicker').value) || 0;
        adminPage(data, status);
        document.getElementById('weekPicker').value = idx;
        renderWeekEditor(data, idx, status);
      }
    };
  });
}

function setPath(obj, path, value){
  const parts = path.split('.');
  let ref = obj;
  for (let i=0; i<parts.length-1; i++) {
    const key = isFinite(parts[i]) ? Number(parts[i]) : parts[i];
    ref = ref[key];
  }
  const last = isFinite(parts[parts.length-1]) ? Number(parts[parts.length-1]) : parts[parts.length-1];
  ref[last] = value;
}

function escapeHTML(s){ return String(s ?? '').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
function escapeAttr(s){ return escapeHTML(s).replace(/'/g, '&#39;'); }

async function initPublic(){
  const data = await loadData(false);
  publicPage(data);
}

async function initAdmin(){
  const unlock = sessionStorage.getItem(SESSION_KEY) === 'yes';
  const data = await loadData(true);
  const gate = document.getElementById('gate');
  const panel = document.getElementById('panel');
  const status = document.getElementById('saveStatus');
  function showPanel(){
    gate.classList.add('hidden');
    panel.classList.remove('hidden');
    adminPage(data, status);
  }
  if (unlock) showPanel();
  document.getElementById('unlockBtn').addEventListener('click', () => {
    const pwd = document.getElementById('pwd').value;
    if (pwd === data.settings.adminPassword) {
      sessionStorage.setItem(SESSION_KEY, 'yes');
      showPanel();
    } else {
      document.getElementById('gateStatus').textContent = 'Incorrect password.';
    }
  });
  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });
}

window.MensLeagueApp = { initPublic, initAdmin, loadData, calcLeague };
})();
