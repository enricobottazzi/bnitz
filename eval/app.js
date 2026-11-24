const $ = selector => document.querySelector(selector);
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const entries = paper => paper.pairs.flatMap(pair => [pair.left, pair.right]);
const finished = map => map.score && map.comment.trim();
let run, paperIndex = 0, poll, saveTimer, routeVersion = 0;
let pending = new Map();
let saving = Promise.resolve();

async function api(path, body) {
  const response = await fetch('/api/' + path, body === undefined ? {} : {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save this run.');
  return result;
}

function report(error) {
  $('#error').textContent = error.message;
  $('#error').hidden = false;
}

function clearError() { $('#error').hidden = true; }

function feedback(map) {
  pending.set(map.id, {paper: paperIndex, mapId: map.id, score: map.score ?? undefined, comment: map.comment});
  $('#save-status').textContent = 'Unsaved changes';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flush().catch(report), 450);
}

async function flush() {
  clearTimeout(saveTimer);
  const id = run?.id;
  saving = saving.catch(() => {}).then(async () => {
    const changes = [...pending.values()];
    pending.clear();
    for (const [index, change] of changes.entries()) {
      $('#save-status').textContent = 'Saving…';
      try {
        const saved = await api(`runs/${id}/feedback`, change);
        Object.assign(run, {scored: saved.scored, complete: saved.complete, status: saved.status});
        // Update identities without replacing a comment field while it is being edited.
        for (const paper of saved.papers) for (const map of entries(paper)) {
          const card = document.querySelector(`[data-map-id="${map.id}"]`);
          if (card && map.model) showIdentity(card, map);
        }
      } catch (error) {
        for (const unsaved of changes.slice(index)) {
          if (!pending.has(unsaved.mapId)) pending.set(unsaved.mapId, unsaved);
        }
        $('#save-status').textContent = 'Not saved · retry';
        throw error;
      }
    }
    if (run) updateChrome();
    if (!pending.size) $('#save-status').textContent = 'Saved';
  });
  return saving;
}

function updateChrome() {
  $('#export').hidden = !run.complete;
  $('#new-run').hidden = false;
  $('#batch-date').textContent = new Date(run.created_at).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
  const scored = run.papers.flatMap(entries).filter(finished).length;
  $('#progress-text').textContent = `${scored} / ${run.total} maps scored`;
  $('#progress').max = run.total;
  $('#progress').value = scored;
  $('#blind-status').hidden = !run.complete;
  $('#blind-status').textContent = 'Complete · identities revealed';
  $('#paper-number').textContent = `Abstract ${paperIndex + 1} of ${run.papers.length}`;
  const paper = run.papers[paperIndex];
  const maps = entries(paper);
  $('#paper-progress').textContent = `${maps.filter(finished).length} / ${maps.length} maps scored`;
  for (const [index, button] of [...$('#paper-nav').children].entries()) {
    const done = entries(run.papers[index]).every(finished);
    button.classList.toggle('finished', done);
    button.setAttribute('aria-current', index === paperIndex ? 'page' : 'false');
    button.querySelector('.number').textContent = done ? '✓' : String(index + 1).padStart(2, '0');
  }
  const all = run.papers.flatMap(entries);
  const ready = all.filter(map => map.ready || map.map).length;
  $('#generation').hidden = all.every(map => map.ready || map.map);
  $('#api-key').hidden = $('#generation').hidden;
  $('#generation-text').textContent = `${ready} / ${run.total} maps ready${run.generating ? ' · generating…' : ''}`;
  $('#generate').disabled = run.generating;
  $('#generate').textContent = run.status === 'error' ? 'Retry missing maps' : 'Generate maps';
  $('#reveal').disabled = !all.every(map => map.ready || map.map);
}

function showIdentity(card, map) {
  card.querySelector('.identity').textContent = `${map.model} · Prompt ${map.prompt}`;
  if (map.decision_note && !card.querySelector('.decision-note')) {
    card.append(element('p', map.decision_note, 'decision-note'));
  }
}

function drawMap(drawing, excerpt, label, article) {
  function select(planet) {
    BNITZView.select(drawing, planet.id);
    const parent = article.spans.find(span => span.id === planet.parent);
    label.textContent = BNITZModel.label(planet) + (parent ? ` · attached to ${BNITZModel.label(parent)}` : ' · main contribution');
    BNITZView.paintText(excerpt, article.text, planet.highlights, null, {typeset: true});
    const mark = excerpt.querySelector('mark');
    excerpt.scrollTop = mark ? mark.getBoundingClientRect().top - excerpt.getBoundingClientRect().top + excerpt.scrollTop - 24 : 0;
  }
  BNITZView.map(drawing, article, select);
  requestAnimationFrame(() => select(article.spans.find(span => span.id === article.core)));
}

function renderHumanMap() {
  const map = run?.papers[paperIndex].human_map;
  $('#human-map').hidden = !map;
  if (map && $('#human-map').open) drawMap($('#human-map-drawing'), $('#human-map-text'), $('#human-map-label'), map);
}

function mapCard(map, paper) {
  const card = element('article', undefined, 'map-card');
  card.dataset.mapId = map.id;
  const heading = element('header');
  heading.append(element('h3', `Map ${map.label}`), element('span', '', 'identity'));
  card.append(heading);
  if (!map.map) {
    card.append(element('p', map.error || 'This map is still being prepared.', 'map-error'));
    return card;
  }
  const drawing = element('div', undefined, 'map');
  const passage = element('div', undefined, 'passage');
  const label = element('p', '', 'passage-label');
  const excerpt = element('div', '', 'passage-text');
  passage.append(label, excerpt);
  const article = {...map.map, text: paper.input.abstract};
  drawMap(drawing, excerpt, label, article);
  card.append(drawing, passage);
  const form = element('div', undefined, 'map-feedback');
  const scoreLabel = element('div', undefined, 'score-label');
  scoreLabel.append(element('span', 'Score'));
  const scores = element('div', undefined, 'scores');
  scores.setAttribute('role', 'group');
  scores.setAttribute('aria-label', `Score map ${map.label}`);
  for (let score = 1; score <= 5; score++) {
    const button = element('button', String(score));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(map.score === score));
    button.setAttribute('aria-label', `${score} out of 5`);
    button.onclick = () => {
      map.score = score;
      for (const candidate of scores.children) candidate.setAttribute('aria-pressed', String(candidate === button));
      feedback(map);
    };
    scores.append(button);
  }
  const comment = element('textarea');
  comment.rows = 3;
  comment.value = map.comment;
  comment.placeholder = 'Comment';
  comment.setAttribute('aria-label', `Comment on map ${map.label}`);
  comment.oninput = () => { map.comment = comment.value; feedback(map); };
  comment.onblur = () => flush().catch(report);
  form.append(scoreLabel, scores, comment);
  card.append(form);
  if (run.complete) showIdentity(card, map);
  return card;
}

function render() {
  $('#setup').hidden = true;
  $('#evaluation').hidden = false;
  const paper = run.papers[paperIndex];
  $('#paper-title').textContent = paper.input.title;
  $('#paper-link').href = paper.source;
  $('#abstract').textContent = paper.input.abstract;
  renderHumanMap();
  const nav = $('#paper-nav');
  nav.replaceChildren(...run.papers.map((entry, index) => {
    const button = element('button', undefined, 'paper-tab');
    button.append(element('span', String(index + 1).padStart(2, '0'), 'number'), element('span', entry.input.title, 'nav-title'));
    button.onclick = () => move(index);
    return button;
  }));
  $('#reveal-panel').hidden = paper.revealed;
  $('#comparisons').replaceChildren();
  if (paper.revealed) for (const pair of paper.pairs) {
    const section = element('section', undefined, 'pair');
    const heading = element('div', undefined, 'pair-heading');
    heading.append(element('h2', pair.label));
    const grid = element('div', undefined, 'map-pair');
    grid.append(mapCard(pair.left, paper), mapCard(pair.right, paper));
    section.append(heading, grid);
    $('#comparisons').append(section);
  }
  $('#previous').disabled = paperIndex === 0;
  $('#next').disabled = paperIndex === run.papers.length - 1;
  updateChrome();
}

async function move(index) {
  try {
    await flush();
    location.hash = `${run.id}/${index}`;
  } catch (error) { report(error); }
}

async function watch() {
  clearTimeout(poll);
  if (!run?.generating) return;
  const id = run.id;
  poll = setTimeout(async () => {
    try {
      await flush();
      const saved = await api(`runs/${id}`);
      if (run?.id !== id || location.hash.slice(1).split('/')[0] !== id) return;
      const wasGenerating = run.generating;
      run = saved;
      if (wasGenerating && !run.generating) render();
      else updateChrome();
      watch();
    } catch (error) { report(error); }
  }, 2000);
}

async function openRoute() {
  const version = ++routeVersion;
  try {
    clearError();
    await flush();
    if (version !== routeVersion) return;
    clearTimeout(poll);
    const [id, index] = location.hash.slice(1).split('/');
    if (!id) {
      run = null;
      $('#evaluation').hidden = true;
      $('#setup').hidden = false;
      $('#export').hidden = true;
      $('#new-run').hidden = true;
      $('#api-key').hidden = false;
      $('#save-status').textContent = '';
      const runs = await api('runs');
      if (version !== routeVersion) return;
      $('#previous-runs').hidden = !runs.length;
      $('#run-list').replaceChildren(...runs.map(item => {
        const button = element('button', undefined, 'run-link');
        button.append(element('span', new Date(item.created_at).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'})), element('span', `${item.scored}/${item.total} scored`, 'muted'));
        button.onclick = () => { location.hash = item.id + '/0'; };
        return button;
      }));
      return;
    }
    const loaded = await api(`runs/${id}`);
    if (version !== routeVersion) return;
    run = loaded;
    paperIndex = Math.max(0, Math.min(run.papers.length - 1, Math.trunc(Number(index) || 0)));
    render();
    watch();
  } catch (error) { report(error); }
}

$('#import-config').onclick = () => $('#config-file').click();
$('#config-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  clearError();
  $('#import-config').disabled = true;
  $('#setup-status').textContent = 'Importing config…';
  try {
    let config;
    try { config = JSON.parse(await file.text()); }
    catch { throw new Error('Choose a valid config JSON file.'); }
    const imported = await api('runs/import', config);
    location.hash = imported.id + '/0';
  } catch (error) { report(error); }
  finally {
    $('#import-config').disabled = false;
    $('#setup-status').textContent = '';
    event.target.value = '';
  }
};
$('#generate').onclick = async () => {
  try {
    clearError();
    run = await api(`runs/${run.id}/generate`, {apiKey: $('#api-key').value.trim()});
    updateChrome();
    watch();
  }
  catch (error) { report(error); }
};
$('#import-bnitz').onclick = () => $('#bnitz-file').click();
$('#bnitz-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  const id = run.id, paper = paperIndex;
  clearError();
  $('#import-bnitz').disabled = true;
  try {
    let map;
    try { map = JSON.parse(await file.text()); }
    catch { throw new Error('Choose a valid .bnitz file.'); }
    await flush();
    const saved = await api(`runs/${id}/feedback`, {paper, human_map: map});
    if (run?.id === id) {
      run.papers[paper].human_map = saved.papers[paper].human_map;
      if (paperIndex === paper) {
        $('#human-map').open = true;
        renderHumanMap();
        $('#save-status').textContent = 'Saved';
      }
    }
  } catch (error) { report(error); }
  finally { $('#import-bnitz').disabled = false; event.target.value = ''; }
};
$('#human-map').ontoggle = () => { if ($('#human-map').open) renderHumanMap(); };
$('#reveal').onclick = async () => {
  try { await flush(); run = await api(`runs/${run.id}/feedback`, {paper: paperIndex, revealed: true}); render(); }
  catch (error) { report(error); }
};
$('#previous').onclick = () => move(paperIndex - 1);
$('#next').onclick = () => move(paperIndex + 1);
$('#new-run').onclick = async () => { try { await flush(); location.hash = ''; } catch (error) { report(error); } };
$('#export').onclick = async () => {
  try {
    await flush();
    const record = await api(`runs/${run.id}/export`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2) + '\n'], {type: 'application/json'}));
    const link = element('a');
    link.href = url;
    link.download = `record_${run.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { report(error); }
};
window.addEventListener('hashchange', openRoute);
window.addEventListener('beforeunload', event => {
  if (pending.size || $('#save-status').textContent === 'Saving…') { event.preventDefault(); event.returnValue = ''; }
});
openRoute();
