(function (root) {
  'use strict';
  if (!root || !root.document) return;
  const doc = root.document;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => doc.getElementById(id);
  const escText = value => String(value == null ? '' : value);
  const format = value => `${Number(value).toLocaleString('zh-HK', { maximumFractionDigits: 1 })} mm`;
  const t = (zh, en) => root.calculator && root.calculator.currentLanguage === 'en' ? en : zh;
  let lastFocus = null;

  function sourceLabel(remnant, candidateNumber) {
    const board = remnant.sourceBoard || {};
    if (board.reusableRemnant === true) return t(`來源板 ${remnant.boardIndex + 1}｜R 餘料 ${board.reusableRemnantId || ''}`, `Source sheet ${remnant.boardIndex + 1} | R remnant ${board.reusableRemnantId || ''}`);
    if (board.added === true) return t(`來源板 ${remnant.boardIndex + 1}｜新增原板`, `Source sheet ${remnant.boardIndex + 1} | new full sheet`);
    const stock = Number.isInteger(board.stockIndex) ? ` #${board.stockIndex + 1}` : '';
    return t(`來源板 ${remnant.boardIndex + 1}${stock}`, `Source sheet ${remnant.boardIndex + 1}${stock}`);
  }

  function validatedCandidates() {
    const api = root.PlywoodRemnantComparison, overlay = root.PlywoodCutOverlay;
    if (!api || !overlay || !root.calculator) return [];
    return api.collectCandidates(root.calculator, overlay);
  }

  function closeDialog() {
    const dialog = $('remnantComparisonDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function returnToSource(candidate, remnant) {
    const app = root.calculator, ui = root.PlywoodTrialUI;
    if (!app || !ui || !remnant) return;
    if (candidate.plan !== app.trialPlan) {
      const pool = Array.isArray(app._trialCandidates) ? app._trialCandidates : [];
      const index = pool.findIndex(item => item && item.plan === candidate.plan);
      if (index < 0 || typeof ui.commitCandidate !== 'function' || !ui.commitCandidate(index)) return;
    }
    closeDialog();
    root.requestAnimationFrame(() => {
      const selector = `#canvasContainer .canvas-container[data-board-index="${Number(remnant.boardIndex)}"]`;
      const card = doc.querySelector(selector);
      if (!card) return;
      card.style.outline = '3px solid #3d895c';
      card.style.outlineOffset = '3px';
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      root.setTimeout(() => { card.style.outline = ''; card.style.outlineOffset = ''; }, 2600);
    });
  }

  function svgElement(name, attrs = {}) {
    const element = doc.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function createPieceMap(candidate, candidateNumber, placements, canvasIndex, model) {
    const card = doc.createElement('div');
    card.className = 'remnant-comparison-canvas-card';
    const caption = doc.createElement('p');
    caption.className = 'remnant-comparison-canvas-label';
    caption.textContent = t(`展示畫布 ${canvasIndex + 1}｜同一比例`, `Display canvas ${canvasIndex + 1} | same scale`);
    card.appendChild(caption);
    const svg = svgElement('svg', {
      class: 'remnant-comparison-canvas',
      viewBox: `0 0 ${model.canvasWidth} ${model.canvasHeight}`,
      role: 'img',
      'aria-label': t(`方案 ${candidateNumber} 的餘板展示畫布 ${canvasIndex + 1}`, `Scheme ${candidateNumber} remnant display canvas ${canvasIndex + 1}`),
      preserveAspectRatio: 'xMidYMid meet'
    });
    svg.appendChild(svgElement('rect', { class: 'remnant-comparison-board', x: 0, y: 0, width: model.canvasWidth, height: model.canvasHeight, rx: 2 }));
    placements.forEach(remnant => {
      const group = svgElement('g', { tabindex: 0, role: 'button', 'aria-label': `${format(remnant.rect.length)} × ${format(remnant.rect.width)}; ${sourceLabel(remnant, candidateNumber)}` });
      const shape = remnant.display;
      const rect = svgElement('rect', { class: 'remnant-comparison-piece', x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: Math.min(8, shape.height / 12) });
      group.appendChild(rect);
      if (shape.width >= 180 && shape.height >= 150) {
        const label = svgElement('text', { class: 'remnant-comparison-number', x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 });
        label.textContent = String(remnant.remnantIndex);
        group.appendChild(label);
      }
      const activate = () => returnToSource(candidate, remnant);
      group.addEventListener('click', activate);
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      });
      svg.appendChild(group);
    });
    card.appendChild(svg);
    return card;
  }

  function render() {
    const button = $('openRemnantComparison'), action = $('remnantComparisonAction'), dialog = $('remnantComparisonDialog'), content = $('remnantComparisonContent');
    if (!button || !dialog || !content || !root.PlywoodRemnantComparison) return;
    const app = root.calculator;
    const candidates = validatedCandidates().map(candidate => ({
      ...candidate,
      remnants: candidate.remnants.map((item, index) => ({ ...item, remnantIndex: index + 1 }))
    }));
    const model = root.PlywoodRemnantComparison.layout(candidates);
    const count = candidates.length;
    button.disabled = count === 0;
    if (action) action.hidden = count === 0;
    button.textContent = t(`比較所有方案的完整餘板（${count} 個）`, `Compare intact remnants (${count} scheme${count === 1 ? '' : 's'})`);
    button.setAttribute('aria-label', button.textContent);
    content.replaceChildren();
    const intro = $('remnantComparisonIntro');
    if (intro) intro.textContent = t(
      '只顯示逐刀回放驗證後的完整終局餘板；每件按真實長×闊尺寸同尺度展示，並標明來源板。圖面只為集中比較而重新擺放，不是原板位置，也不代表可以拼接。點選餘板或下方尺寸可回到該方案原板。',
      'Only complete final remnants from cut-replay-validated schemes are shown. Each is drawn to its real length × width at one shared scale and identifies its source sheet. Pieces are rearranged only for comparison; this is not their original position and they are not joined. Tap a piece or its size below to return to that scheme and sheet.'
    );
    if (!count) {
      const empty = doc.createElement('p');
      empty.className = 'remnant-comparison-empty';
      empty.textContent = t('目前沒有通過驗證的方案可比較。', 'No validated scheme is available to compare.');
      content.appendChild(empty);
      return;
    }
    if (model.canvasCount > 2) {
      const note = doc.createElement('p');
      note.className = 'remnant-comparison-empty';
      note.textContent = t(`為保留全部實際尺寸及同一比例，需用 ${model.canvasCount} 張相同展示畫布；沒有省略或縮放餘板。`, `${model.canvasCount} identical display canvases are needed to preserve every true size at the same scale; no remnants were omitted or resized.`);
      content.appendChild(note);
    }
    model.candidates.forEach((candidate, index) => {
      const candidateNumber = index + 1;
      const scheme = doc.createElement('section');
      scheme.className = 'remnant-comparison-scheme';
      const heading = doc.createElement('h3');
      heading.textContent = candidate.plan === app.trialPlan
        ? t(`方案 ${candidateNumber}｜目前切割方案`, `Scheme ${candidateNumber} | current cutting plan`)
        : t(`方案 ${candidateNumber}`, `Scheme ${candidateNumber}`);
      scheme.appendChild(heading);
      const countLine = doc.createElement('p');
      countLine.className = 'remnant-comparison-count';
      countLine.textContent = t(`完整餘板 ${candidate.remnants.length} 件`, `${candidate.remnants.length} intact remnant${candidate.remnants.length === 1 ? '' : 's'}`);
      scheme.appendChild(countLine);
      if (!candidate.remnants.length) {
        const empty = doc.createElement('p');
        empty.className = 'remnant-comparison-empty';
        empty.textContent = t('此方案沒有完整終局餘板。', 'This scheme has no complete final remnants.');
        scheme.appendChild(empty);
      } else {
        const canvasWrap = doc.createElement('div');
        canvasWrap.className = 'remnant-comparison-canvas-wrap';
        canvasWrap.dataset.canvasCount = String(model.canvasCount);
        candidate.canvases.forEach((placements, canvasIndex) => canvasWrap.appendChild(createPieceMap(candidate, candidateNumber, placements, canvasIndex, model)));
        scheme.appendChild(canvasWrap);
        const list = doc.createElement('ol');
        list.className = 'remnant-comparison-piece-list';
        candidate.remnants.forEach(remnant => {
          const item = doc.createElement('li');
          const itemButton = doc.createElement('button');
          itemButton.type = 'button';
          itemButton.className = 'remnant-comparison-piece-button';
          const dimensions = `${format(remnant.rect.length)} × ${format(remnant.rect.width)}`;
          const source = sourceLabel(remnant, candidateNumber);
          const strong = doc.createElement('strong');
          strong.textContent = `${remnant.remnantIndex}. ${dimensions}`;
          itemButton.append(strong, doc.createElement('br'), doc.createTextNode(source));
          itemButton.addEventListener('click', () => returnToSource(candidate, remnant));
          item.appendChild(itemButton);
          list.appendChild(item);
        });
        scheme.appendChild(list);
      }
      content.appendChild(scheme);
    });
    const footnote = doc.createElement('p');
    footnote.className = 'remnant-comparison-footnote';
    footnote.textContent = t('方案餘料是候選結果，不會自動加入實物庫存；只有實際鋸出並確認後，才可在切割圖的餘料清單加入庫存。', 'Candidate remnants are not added to physical stock automatically. Add them from the cutting view only after they have actually been cut and confirmed.');
    content.appendChild(footnote);
  }

  function bind() {
    const button = $('openRemnantComparison'), dialog = $('remnantComparisonDialog'), close = $('closeRemnantComparison');
    if (!button || !dialog || !close) return;
    button.addEventListener('click', () => {
      render();
      lastFocus = button;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      close.focus();
    });
    close.addEventListener('click', closeDialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    root.addEventListener('resize', render, { passive: true });
    root.PlywoodRemnantComparisonUI = { render, close: closeDialog };
    render();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})(typeof window !== 'undefined' ? window : null);
