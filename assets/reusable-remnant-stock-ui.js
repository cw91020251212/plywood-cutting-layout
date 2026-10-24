(function (root) {
  'use strict';
  if (!root || !root.document) return;
  const doc = root.document;
  const $ = id => doc.getElementById(id);
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 50000;
  const t = (zh, en) => root.calculator && root.calculator.currentLanguage === 'en' ? en : zh;
  const stockApi = root.PlywoodRemnantStock;
  let manualEntryUnitSystem = null;

  function app() { return root.calculator || null; }
  function selectedUnitSystem() {
    const selector = $('unitSystem'), calc = app();
    return (selector && selector.value) || (calc && calc.unitSystem) || 'metric';
  }
  function updateManualEntryUnits() {
    const system = selectedUnitSystem(), imperial = system === 'imperial';
    if (manualEntryUnitSystem && manualEntryUnitSystem !== system) {
      const oldFactor = manualEntryUnitSystem === 'imperial' ? 25.4 : 1;
      const newFactor = imperial ? 25.4 : 1;
      for (const inputId of ['manualRemnantWidth', 'manualRemnantLength']) {
        const input = $(inputId), value = input && Number(input.value);
        if (input && input.value.trim() && Number.isFinite(value)) {
          input.value = String(Number((value * oldFactor / newFactor).toFixed(4)));
        }
      }
    }
    manualEntryUnitSystem = system;
    for (const [labelId, inputId, zh, en] of [
      ['manualRemnantWidthLabel', 'manualRemnantWidth', '闊', 'Width'],
      ['manualRemnantLengthLabel', 'manualRemnantLength', '長', 'Length']
    ]) {
      const label = $(labelId), input = $(inputId);
      if (label) {
        label.textContent = t(`${zh}（${imperial ? '寸' : 'mm'}）`, `${en} (${imperial ? 'in' : 'mm'})`);
        const editor = $(`${inputId}__editor`);
        if (editor) editor.setAttribute('aria-label', label.textContent);
      }
      if (input) {
        input.min = imperial ? '0.01' : '0.1';
        input.max = imperial ? String(50000 / 25.4) : '50000';
        input.step = imperial ? '0.01' : '0.1';
      }
    }
  }
  function formatStockDimension(value) {
    const calc = app();
    if (calc && typeof calc._formatTrialDimension === 'function') {
      return calc._formatTrialDimension(value, null);
    }
    return `${Number(value).toLocaleString('zh-HK', { maximumFractionDigits: 1 })} mm`;
  }
  function records() {
    const calc = app();
    if (!calc) return [];
    if (!Array.isArray(calc.reusableRemnantStock)) calc.reusableRemnantStock = [];
    const normalized = stockApi.normalizeStockRecords(calc.reusableRemnantStock, calc.reusableRemnantNextId);
    calc.reusableRemnantStock = normalized.records;
    calc.reusableRemnantNextId = normalized.nextId;
    return calc.reusableRemnantStock;
  }

  function sourceLabel(record) {
    if (record.sourceScheme || record.sourceBoardId) {
      return t(`來源：${record.sourceScheme || '方案'} · 板 ${record.sourceBoardId || '—'}`, `Source: ${record.sourceScheme || 'scheme'} · sheet ${record.sourceBoardId || '—'}`);
    }
    return t('來源：手動登記', 'Source: manual entry');
  }

  function statusLabel(status) {
    return status === 'held' ? t('暫停', 'Held') : status === 'used' ? t('已使用', 'Used') : t('可用', 'Available');
  }

  function currentBoardIds() {
    const calc = app();
    return new Set((calc && Array.isArray(calc.boards) ? calc.boards : []).map(board => board && (board.reusableRemnantStockId || board.reusableRemnantId)).filter(Boolean));
  }

  function setStatus(id, status) {
    if (!stockApi.STATUSES.includes(status)) return;
    const record = records().find(item => item.id === id);
    if (!record) return;
    if (status === 'used') {
      const message = t(`只有在實物已經實際鋸切並用掉後，才標記為「已使用」。確認 ${record.id}（${record.length} × ${record.width} mm）已實際用掉？`, `Mark ${record.id} (${record.length} × ${record.width} mm) as used only after it has physically been cut and consumed. Confirm actual use?`);
      if (typeof root.confirm !== 'function' || !root.confirm(message)) return;
    }
    record.status = status;
    const calc = app();
    if (calc && typeof calc.resetResults === 'function' && calc.trialPlan) calc.resetResults();
    renderManager();
    if (calc && typeof calc.updateBoardsTable === 'function') calc.updateBoardsTable();
    const statusNode = $('status');
    if (statusNode) {
      statusNode.textContent = status === 'used'
        ? t(`${record.id} 已由你手動標記為已使用；不會再列入排料。`, `${record.id} was manually marked used and will no longer be considered for layouts.`)
        : status === 'held'
          ? t(`${record.id} 已暫停；仍保留紀錄，但會從排料候選排除。`, `${record.id} is held; its record remains visible, but it is excluded from layouts.`)
          : t(`${record.id} 已恢復為可用。`, `${record.id} is available again.`);
      statusNode.style.display = 'block';
    }
  }

  function actionButton(label, id, status) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.stockId = id;
    button.dataset.stockStatus = status;
    return button;
  }

  function renderManager() {
    const list = $('remnantStockList'), summary = $('remnantStockManagerSummary'), guidance = $('remnantStockGuidance');
    updateManualEntryUnits();
    if (!list || !summary) return;
    const inventory = records();
    const available = inventory.filter(item => item.status === 'available').length;
    const held = inventory.filter(item => item.status === 'held').length;
    const used = inventory.filter(item => item.status === 'used').length;
    summary.textContent = t(`實物餘料庫存（${inventory.length} 件｜可用 ${available}｜暫停 ${held}｜已用 ${used}）`, `Physical remnant stock (${inventory.length} | ${available} available, ${held} held, ${used} used)`);
    if (guidance) guidance.textContent = t(
      '只在實物已鋸出並量度後登記。可用、暫停、已使用分開保存；暫停／已用仍可見但不會排料。選取一件或全選可用餘料帶入本次板材；排料先試 R 餘料，不足才以新原板補足。排入方案不會改庫存；實際用料後才手動標記已使用。現階段程式只按尺寸判斷，木種、厚度及實物狀況必須自行核對。庫存隨 JSON 保存，跨批次請載入／儲存同一份檔案。',
      'Register only pieces that have actually been cut and measured. Available, held and used are stored separately; held/used remain visible but are excluded from layouts. Select one or all available pieces to add to this job’s sheet list. Layout tries R stock first, then supplements with new full sheets. Choosing a piece in a plan never changes stock; manually mark it used only after physical use. The app currently checks dimensions only, so verify material type, thickness and condition yourself. Stock is saved in the project JSON; load/save the same file across jobs.'
    );
    const idsInUse = currentBoardIds();
    const sorted = inventory.slice().sort((a, b) => (stockApi.stockIdNumber(a.id) || 0) - (stockApi.stockIdNumber(b.id) || 0));
    list.replaceChildren();
    if (!sorted.length) {
      const empty = doc.createElement('li');
      empty.className = 'remnant-stock-row';
      empty.textContent = t('尚未登記實物餘料；可手動新增，或在已驗證切割方案中確認實際鋸出的餘料。', 'No physical remnants recorded yet. Add one manually or confirm a remnant from a validated plan after it has been cut.');
      list.appendChild(empty);
    }
    sorted.forEach(record => {
      const row = doc.createElement('li');
      row.className = 'remnant-stock-row';
      const head = doc.createElement('div');
      head.className = 'remnant-stock-row-head';
      if (record.status === 'available' && !idsInUse.has(record.id)) {
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'remnant-stock-select';
        checkbox.dataset.stockSelect = record.id;
        checkbox.setAttribute('aria-label', t(`選取 ${record.id} 帶入本次板材`, `Select ${record.id} for this job`));
        head.appendChild(checkbox);
      } else {
        const spacer = doc.createElement('span');
        spacer.className = 'remnant-stock-select';
        spacer.setAttribute('aria-hidden', 'true');
        head.appendChild(spacer);
      }
      const main = doc.createElement('div');
      main.className = 'remnant-stock-row-main';
      const title = doc.createElement('strong');
      title.textContent = `${record.id} · ${formatStockDimension(record.length)} × ${formatStockDimension(record.width)}`;
      main.appendChild(title);
      const status = doc.createElement('span');
      status.className = 'remnant-stock-status';
      status.dataset.status = record.status;
      status.textContent = statusLabel(record.status);
      main.appendChild(status);
      const source = doc.createElement('p');
      source.className = 'remnant-stock-source';
      source.textContent = sourceLabel(record);
      main.appendChild(source);
      head.appendChild(main);
      row.appendChild(head);
      if (idsInUse.has(record.id)) {
        const note = doc.createElement('p');
        note.className = 'remnant-stock-selected-note';
        note.textContent = t('已加入本次板材清單；選用方案不會自動標記為已使用。', 'In this job’s sheet list. Selecting it in a plan does not mark it used.');
        row.appendChild(note);
      } else if (record.status !== 'available') {
        const note = doc.createElement('p');
        note.className = 'remnant-stock-selected-note';
        note.textContent = record.status === 'held'
          ? t('暫停中的餘料不會列入本次排料。', 'Held stock is excluded from this job.')
          : t('已使用的餘料保留作歷史記錄，不會再次排料。', 'Used stock remains in history and is not laid out again.');
        row.appendChild(note);
      }
      const actions = doc.createElement('div');
      actions.className = 'remnant-stock-actions';
      if (record.status === 'available') actions.append(actionButton(t('暫停', 'Hold'), record.id, 'held'));
      else if (record.status === 'held') actions.append(actionButton(t('恢復可用', 'Make available'), record.id, 'available'));
      else actions.append(actionButton(t('恢復可用（更正狀態）', 'Restore as available'), record.id, 'available'));
      if (record.status !== 'used') actions.append(actionButton(t('實際用掉後標記已使用', 'Mark used after physical use'), record.id, 'used'));
      row.appendChild(actions);
      list.appendChild(row);
    });
    const summaryNote = $('reusableRemnantStockSummary');
    if (summaryNote) { summaryNote.hidden = true; summaryNote.textContent = ''; }
  }

  function appendRecord(width, length, fields = {}) {
    const inventory = records();
    const allocation = stockApi.allocateStockIds(inventory, 1, app().reusableRemnantNextId);
    app().reusableRemnantNextId = allocation.nextId;
    const id = allocation.ids[0];
    inventory.push({ id, reusableRemnantId: id, width: Number(width), length: Number(length), status: 'available',
      sourceKey: fields.sourceKey || '', sourceScheme: fields.sourceScheme || '', sourceBoardId: fields.sourceBoardId || '',
      createdAt: new Date().toISOString() });
    return inventory[inventory.length - 1];
  }

  function addManual() {
    const widthInput = $('manualRemnantWidth'), lengthInput = $('manualRemnantLength');
    const enteredWidth = widthInput ? widthInput.value.trim() : '';
    const enteredLength = lengthInput ? lengthInput.value.trim() : '';
    const system = selectedUnitSystem();
    const factor = system === 'imperial' ? 25.4 : 1;
    const width = Number(enteredWidth) * factor;
    const length = Number(enteredLength) * factor;
    if (!positive(width) || !positive(length)) {
      const max = system === 'imperial' ? (50000 / 25.4).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '50,000';
      const unit = t(system === 'imperial' ? '寸' : 'mm', system === 'imperial' ? 'in' : 'mm');
      const message = t(`尺寸須大於 0 且不超過 ${max} ${unit}。`, `Enter dimensions greater than 0 and no more than ${max} ${unit}.`);
      if (typeof root.alert === 'function') root.alert(message);
      return;
    }
    const record = appendRecord(width, length);
    widthInput.value = '';
    lengthInput.value = '';
    renderManager();
    const status = $('status');
    const enteredUnit = t(system === 'imperial' ? '寸' : 'mm', system === 'imperial' ? 'in' : 'mm');
    if (status) { status.textContent = t(`已新增 ${record.id}（${enteredLength} × ${enteredWidth} ${enteredUnit}）為可用庫存；請在 JSON 儲存以備份。`, `Added ${record.id} (${enteredLength} × ${enteredWidth} ${enteredUnit}) as available stock; save the project JSON to back it up.`); status.style.display = 'block'; }
  }

  function addSelectedToBoards() {
    const calc = app();
    if (!calc || !Array.isArray(calc.boards)) return;
    const selected = [...doc.querySelectorAll('[data-stock-select]:checked')].map(input => input.dataset.stockSelect);
    if (!selected.length) return;
    const inventory = records(), byId = new Map(inventory.map(record => [record.id, record]));
    const exists = currentBoardIds();
    const added = [];
    for (const id of selected) {
      const record = byId.get(id);
      if (!record || record.status !== 'available' || exists.has(id)) continue;
      calc.boards.push({ width: Number(record.width), length: Number(record.length), displayUnitSystem: 'metric', disabled: false,
        reusableRemnant: true, reusableRemnantId: record.id, reusableRemnantStockId: record.id,
        reusableRemnantSourceKey: record.sourceKey || null, reusableRemnantSourceBoardId: record.sourceBoardId || null });
      exists.add(id); added.push(id);
    }
    if (!added.length) return;
    if (typeof calc.updateBoardsTable === 'function') calc.updateBoardsTable();
    if (typeof calc.resetResults === 'function') calc.resetResults();
    const status = $('status');
    if (status) { status.textContent = t(`已將 ${added.join('、')} 帶入本次板材清單；庫存仍為可用，排入方案不會自動扣除。`, `Added ${added.join(', ')} to this job’s sheet list. Stock remains available; planning does not automatically consume it.`); status.style.display = 'block'; }
  }

  function addSourceOffer(rootNode, plan) {
    let host = doc.getElementById('remnantStockOfferHost');
    if (!host && rootNode) {
      host = doc.createElement('div'); host.id = 'remnantStockOfferHost';
      rootNode.insertAdjacentElement('afterend', host);
    }
    if (host) { host.replaceChildren(); host.hidden = true; }
    const calc = app(), overlay = root.PlywoodCutOverlay, ui = root.PlywoodTrialUI;
    if (!rootNode || !plan || !calc || !overlay || !overlay.isVerifiedPlan(plan) || !ui || typeof ui.getEligibleRemnantEntries !== 'function') return;
    const all = ui.getEligibleRemnantEntries(plan);
    const existing = new Set(records().map(record => record.sourceKey).filter(Boolean));
    const candidates = all.filter(leaf => !existing.has(leaf.sourceKey));
    const threshold = stockApi.normalizeThreshold({ shortSide: $('remnantMinShortSide')?.value, longSide: $('remnantMinLongSide')?.value });
    const english = calc.currentLanguage === 'en';
    const currentIndex = Number(calc._trialCandidateIndex || 0) + 1;
    const section = doc.createElement('details');
    section.className = 'input-hint strategy-hint reusable-remnant-offer';
    const summary = doc.createElement('summary');
    summary.textContent = t(`登記餘料（${candidates.length} 件）`, `Add remnants (${candidates.length})`);
    section.appendChild(summary);
    const heading = doc.createElement('strong');
    heading.className = 'reusable-remnant-offer-heading';
    heading.textContent = t(`方案 ${currentIndex}：實際切出後可登記的完整餘料`, `Scheme ${currentIndex}: intact remnants to register after cutting`);
    section.appendChild(heading);
    const intro = doc.createElement('p');
    intro.textContent = t(`完整逐刀驗證餘料；短邊 ≥ ${threshold.shortSide} mm、長邊 ≥ ${threshold.longSide} mm。鋸出、量度、標記後才入庫。`, `Complete cut-verified remnants; short side ≥ ${threshold.shortSide} mm, long side ≥ ${threshold.longSide} mm. Cut, measure and label before adding to stock.`);
    section.appendChild(intro);
    if (!candidates.length) {
      const empty = doc.createElement('p');
      empty.textContent = all.length ? t('符合門檻的餘料已全部登記；如要登記其他尺寸，可把門檻設為 0。', 'All qualifying remnants are already registered. Set thresholds to 0 to include smaller pieces.') : t('此方案沒有符合目前尺寸門檻的完整終局餘料；修邊料和鋸縫不計。', 'This scheme has no complete final remnants meeting the current thresholds. Trim waste and kerf are excluded.');
      section.appendChild(empty);
      if (host) { host.hidden = false; host.appendChild(section); }
      return;
    }
    const selectBar = doc.createElement('div');
    selectBar.className = 'remnant-stock-toolbar';
    const selectAll = doc.createElement('button'); selectAll.type = 'button'; selectAll.textContent = t('全選此方案餘料', 'Select all from this scheme');
    const clear = doc.createElement('button'); clear.type = 'button'; clear.textContent = t('取消選取', 'Clear selection');
    selectBar.append(selectAll, clear); section.appendChild(selectBar);
    const list = doc.createElement('ul'); list.className = 'remnant-stock-list';
    const checks = [];
    candidates.forEach((leaf, index) => {
      const row = doc.createElement('li'); row.className = 'remnant-stock-row';
      const label = doc.createElement('label'); label.className = 'remnant-stock-row-head';
      const checkbox = doc.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'remnant-stock-select'; checkbox.value = String(index);
      checkbox.setAttribute('aria-label', t(`選取 ${leaf.rect.length} × ${leaf.rect.width} mm 餘料`, `Select ${leaf.rect.length} × ${leaf.rect.width} mm remnant`));
      checks.push(checkbox);
      const details = doc.createElement('span'); details.className = 'remnant-stock-row-main';
      const strong = doc.createElement('strong'); strong.textContent = `${Number(leaf.rect.length).toLocaleString('zh-HK', { maximumFractionDigits: 1 })} × ${Number(leaf.rect.width).toLocaleString('zh-HK', { maximumFractionDigits: 1 })} mm`;
      const source = doc.createElement('span'); source.className = 'remnant-stock-source'; source.textContent = t(`來源板 ${leaf.boardIndex + 1}｜${leaf.boardId}`, `Source sheet ${leaf.boardIndex + 1} | ${leaf.boardId}`);
      details.append(strong, source); label.append(checkbox, details); row.appendChild(label); list.appendChild(row);
    });
    section.appendChild(list);
    selectAll.addEventListener('click', () => checks.forEach(check => { check.checked = true; }));
    clear.addEventListener('click', () => checks.forEach(check => { check.checked = false; }));
    const save = doc.createElement('button'); save.type = 'button'; save.className = 'scheme-button';
    save.textContent = t(`確認所選餘料入庫`, `Confirm selected remnants into stock`);
    save.addEventListener('click', () => {
      if (calc.trialPlan !== plan) return;
      const selected = checks.map((check, index) => check.checked ? candidates[index] : null).filter(Boolean);
      if (!selected.length) { if (typeof root.alert === 'function') root.alert(t('請先選取一件或多件餘料。', 'Select one or more remnants first.')); return; }
      const currentAll = ui.getEligibleRemnantEntries(plan), currentByKey = new Map(currentAll.map(leaf => [leaf.sourceKey, leaf]));
      const fresh = selected.map(leaf => currentByKey.get(leaf.sourceKey)).filter(leaf => leaf && !records().some(record => record.sourceKey === leaf.sourceKey));
      if (!fresh.length) { renderManager(); return; }
      const lines = fresh.map(leaf => `${leaf.rect.length} × ${leaf.rect.width} mm · ${leaf.boardId}`).join('\n');
      const confirmText = t(`只有在以下餘料已實際鋸出、量度、按 R 編號標記並存放後才登記：\n${lines}\n確認這些實物已備妥？`, `Register only after these pieces have been physically cut, measured, labelled with R IDs and stored:\n${lines}\nAre these physical pieces ready?`);
      if (typeof root.confirm !== 'function' || !root.confirm(confirmText)) return;
      const allocation = stockApi.allocateStockIds(records(), fresh.length, calc.reusableRemnantNextId);
      calc.reusableRemnantNextId = allocation.nextId;
      const sourceScheme = t(`方案 ${currentIndex}`, `Scheme ${currentIndex}`);
      fresh.forEach((leaf, index) => {
        const board = plan.boards[leaf.boardIndex];
        const id = allocation.ids[index];
        calc.reusableRemnantStock.push({ id, reusableRemnantId: id, width: Number(leaf.rect.width), length: Number(leaf.rect.length), status: 'available',
          sourceKey: leaf.sourceKey, sourceScheme,
          sourceBoardId: `${leaf.boardId}${board && board.stockIndex != null ? ` (#${board.stockIndex + 1})` : ''}`, createdAt: new Date().toISOString() });
      });
      calc.reusableRemnantNextId = allocation.nextId;
      renderManager();
      const status = $('status');
      if (status) { status.textContent = t(`已把 ${fresh.length} 件實物餘料登記為可用庫存；需手動加入本次板材，並儲存 JSON 備份。`, `Registered ${fresh.length} physical remnant${fresh.length === 1 ? '' : 's'} as available stock. Add them to this job manually and save the JSON backup.`); status.style.display = 'block'; }
    });
    section.appendChild(save);
    const caveat = doc.createElement('p'); caveat.className = 'remnant-comparison-footnote';
    caveat.textContent = t('尺寸為預計值；不符請手動登記。', 'Dimensions are estimates; manually enter any differences.');
    section.appendChild(caveat);
    if (host) { host.hidden = false; host.appendChild(section); }
  }

  function bind() {
    if (!stockApi) return;
    const calc = app();
    if (!calc) return;
    if (!Array.isArray(calc.reusableRemnantStock)) calc.reusableRemnantStock = [];
    if (!Number.isSafeInteger(Number(calc.reusableRemnantNextId))) calc.reusableRemnantNextId = 1;
    const legacy = (calc.boards || []).filter(board => board && board.reusableRemnant === true);
    if (!calc.reusableRemnantStock.length && legacy.length) {
      calc.reusableRemnantStock = legacy.map(board => ({
        id: board.reusableRemnantId || '', reusableRemnantId: board.reusableRemnantId || '',
        width: Number(board.width), length: Number(board.length ?? board.height), status: 'available',
        sourceKey: board.reusableRemnantSourceKey || '', sourceScheme: '', sourceBoardId: board.reusableRemnantSourceBoardId || '', createdAt: ''
      })).filter(record => positive(record.width) && positive(record.length));
    }
    const normalized = stockApi.normalizeStockRecords(calc.reusableRemnantStock, calc.reusableRemnantNextId);
    calc.reusableRemnantStock = normalized.records; calc.reusableRemnantNextId = normalized.nextId;
    $('addManualRemnant')?.addEventListener('click', addManual);
    $('selectAllRemnants')?.addEventListener('click', () => doc.querySelectorAll('[data-stock-select]').forEach(input => { input.checked = true; }));
    $('clearRemnantSelection')?.addEventListener('click', () => doc.querySelectorAll('[data-stock-select]').forEach(input => { input.checked = false; }));
    $('addSelectedRemnants')?.addEventListener('click', addSelectedToBoards);
    $('remnantStockList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-stock-id][data-stock-status]');
      if (button) setStatus(button.dataset.stockId, button.dataset.stockStatus);
    });
    renderManager();
    root.PlywoodRemnantStockUI = { renderManager, attachOffer: addSourceOffer, appendRecord, records };
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})(typeof window !== 'undefined' ? window : null);
