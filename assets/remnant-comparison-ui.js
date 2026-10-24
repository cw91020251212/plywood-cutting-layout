(function (root) {
  'use strict';
  if (!root || !root.document) return;
  const doc = root.document;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => doc.getElementById(id);
  const t = (zh, en) => root.calculator && root.calculator.currentLanguage === 'en' ? en : zh;
  const DISPLAY_GAP = 48;
  const DISPLAY_PADDING = 68;
  let lastFocus = null;
  let measureCanvas = null;

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

  function returnToCandidate(candidate) {
    const app = root.calculator, ui = root.PlywoodTrialUI;
    if (!app || !ui || !candidate || !candidate.plan) return;
    if (candidate.plan !== app.trialPlan) {
      const pool = Array.isArray(app._trialCandidates) ? app._trialCandidates : [];
      const index = pool.findIndex(item => item && item.plan === candidate.plan);
      if (index < 0 || typeof ui.commitCandidate !== 'function' || !ui.commitCandidate(index)) return;
    }
    closeDialog();
    root.requestAnimationFrame(() => {
      const boardIndex = candidate.plan.boards && candidate.plan.boards.length ? 0 : null;
      if (boardIndex === null) return;
      const card = doc.querySelector(`#canvasContainer .canvas-container[data-board-index="${boardIndex}"]`);
      if (!card) return;
      card.style.outline = '3px solid #3d895c';
      card.style.outlineOffset = '3px';
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      root.setTimeout(() => { card.style.outline = ''; card.style.outlineOffset = ''; }, 2600);
    });
  }

  function svgElement(name, attrs = {}) {
    const element = doc.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) element.setAttribute(key, String(value));
    });
    return element;
  }

  function sourceBoardFor(candidate, remnant) {
    const planBoard = remnant.sourceBoard || (candidate.plan.boards || []).find(board => board && board.boardId === remnant.boardId) || {};
    const inputs = root.calculator && Array.isArray(root.calculator.boards) ? root.calculator.boards : [];
    if (planBoard.stockIndex != null && inputs[planBoard.stockIndex]) return inputs[planBoard.stockIndex];
    return inputs.find(item => item && !item.disabled &&
      Math.abs(Number(item.width) - Number(planBoard.width)) < 1e-7 &&
      Math.abs(Number(item.length ?? item.height) - Number(planBoard.length ?? planBoard.height)) < 1e-7) || planBoard;
  }

  function formatDimension(amount, source) {
    const app = root.calculator;
    const format = app && app._formatTrialDimension;
    const selector = $('unitSystem');
    const unitSystem = (selector && selector.value) || (app && app.unitSystem) || source.displayUnitSystem || 'metric';
    const formattingSource = { ...source, displayUnitSystem: unitSystem, unitSystem };
    const formatOne = amount => {
      if (typeof format === 'function') {
        try { return format.call(app, Number(amount), formattingSource); } catch (_) { /* use the same selected system below */ }
      }
      if (root.PlywoodLayoutView && typeof root.PlywoodLayoutView.formatLength === 'function') {
        return root.PlywoodLayoutView.formatLength(Number(amount), {
          system: unitSystem,
          preserve: false,
          english: app && app.currentLanguage === 'en'
        });
      }
      return unitSystem === 'imperial'
        ? `${(Number(amount) / 25.4).toFixed(2)}${app && app.currentLanguage === 'en' ? ' in' : '寸'}`
        : `${Number(amount).toFixed(1)} mm`;
    };
    return formatOne(Number(amount));
  }

  function formatRemnantDimensions(candidate, remnant) {
    const source = sourceBoardFor(candidate, remnant);
    const value = remnant.rect || {};
    // Match the main diagram's width × length convention.
    const width = formatDimension(value.width, source), length = formatDimension(value.length, source);
    return `${width} × ${length}`;
  }

  function line(svg, x1, y1, x2, y2, className) {
    svg.appendChild(svgElement('line', { class: className, x1, y1, x2, y2, 'aria-hidden': 'true' }));
  }

  function appendOverallDimensionTag(svg, centerX, centerY, labelText, fontPx, unitsPerPixel, rotation, axis) {
    if (!measureCanvas) measureCanvas = doc.createElement('canvas');
    const context = measureCanvas.getContext('2d');
    context.font = `600 ${fontPx}px Arial, sans-serif`;
    const labelWidth = (context.measureText(labelText).width + 8) * unitsPerPixel;
    const labelHeight = (fontPx * 1.35 + 4) * unitsPerPixel;
    const group = svgElement('g', {
      class: 'remnant-comparison-overall-dimension-tag',
      'data-overall-dimension': axis,
      'aria-label': labelText,
      transform: rotation ? `rotate(${rotation} ${centerX} ${centerY})` : undefined
    });
    group.appendChild(svgElement('rect', {
      class: 'remnant-comparison-dimension-label-bg',
      x: centerX - labelWidth / 2,
      y: centerY - labelHeight / 2,
      width: labelWidth,
      height: labelHeight
    }));
    const text = svgElement('text', {
      class: 'remnant-comparison-dimension-label-text',
      x: centerX,
      y: centerY,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'font-size': fontPx * unitsPerPixel
    });
    text.textContent = labelText;
    group.appendChild(text);
    svg.appendChild(group);
  }

  function boxOverlaps(a, b) {
    return a.x < b.x + b.width - 1e-7 && a.x + a.width > b.x + 1e-7 &&
      a.y < b.y + b.height - 1e-7 && a.y + a.height > b.y + 1e-7;
  }

  function labelBoxAt(cx, cy, width, height, rotation) {
    const rotated = Math.abs(rotation) % 180 === 90;
    const boxWidth = rotated ? height : width;
    const boxHeight = rotated ? width : height;
    return { x: cx - boxWidth / 2, y: cy - boxHeight / 2, width: boxWidth, height: boxHeight, cx, cy, rotation };
  }

  function dimensionLabelPlacement(piece, pieces, priorLabels, labelWidth, labelHeight, gap, boardWidth, boardHeight) {
    const horizontal = piece.width >= piece.height;
    const rotation = horizontal ? 0 : -90;
    const margin = Math.max(1, gap * 0.08);
    const inside = labelBoxAt(piece.x + piece.width / 2, piece.y + piece.height / 2, labelWidth, labelHeight, rotation);
    if (inside.width <= piece.width - margin * 2 && inside.height <= piece.height - margin * 2) {
      return { ...inside, outside: false };
    }
    const longStart = horizontal ? piece.x : piece.y;
    const longSize = horizontal ? piece.width : piece.height;
    const longCenters = [0.5, 0.33, 0.67, 0.2, 0.8, 0.1, 0.9, 0.4, 0.6]
      .map(fraction => longStart + longSize * fraction);
    const offset = Math.max(gap / 2, labelHeight / 2 + margin);
    const sides = horizontal
      ? [
          { cx: piece.x + piece.width / 2, cy: piece.y - offset },
          { cx: piece.x + piece.width / 2, cy: piece.y + piece.height + offset },
          ...longCenters.slice(1).flatMap(cx => [{ cx, cy: piece.y - offset }, { cx, cy: piece.y + piece.height + offset }])
        ]
      : [
          { cx: piece.x - offset, cy: piece.y + piece.height / 2 },
          { cx: piece.x + piece.width + offset, cy: piece.y + piece.height / 2 },
          ...longCenters.slice(1).flatMap(cy => [{ cx: piece.x - offset, cy }, { cx: piece.x + piece.width + offset, cy }])
        ];

    for (const point of sides) {
      const box = labelBoxAt(point.cx, point.cy, labelWidth, labelHeight, rotation);
      if (box.x < 1 || box.y < 1 || box.x + box.width > boardWidth - 1 || box.y + box.height > boardHeight - 1) continue;
      if (boxOverlaps(box, piece)) continue;
      if (pieces.some(other => other !== piece && boxOverlaps(box, other))) continue;
      if (priorLabels.some(other => boxOverlaps(box, other))) continue;
      return { ...box, outside: true };
    }
    // Dense layouts still retain the dimension on the source remnant instead of routing a long crossing leader.
    return { ...inside, outside: true, fallback: true };
  }

  function appendDimensionTag(svg, piece, allPieces, priorLabels, labelText, fontPx, unitsPerPixel, gap, boardWidth, boardHeight) {
    if (!measureCanvas) measureCanvas = doc.createElement('canvas');
    const context = measureCanvas.getContext('2d');
    context.font = `600 ${fontPx}px Arial, sans-serif`;
    const measuredPx = context.measureText(labelText).width;
    const labelWidth = (measuredPx + 5.2) * unitsPerPixel;
    const labelHeight = (fontPx * 1.22 + 2) * unitsPerPixel;
    const placement = dimensionLabelPlacement(piece, allPieces, priorLabels, labelWidth, labelHeight, gap, boardWidth, boardHeight);
    const nearestOnPiece = {
      x: Math.max(piece.x, Math.min(placement.cx, piece.x + piece.width)),
      y: Math.max(piece.y, Math.min(placement.cy, piece.y + piece.height))
    };
    if (placement.outside && !placement.fallback) {
      const nearestOnTag = {
        x: Math.max(placement.x, Math.min(nearestOnPiece.x, placement.x + placement.width)),
        y: Math.max(placement.y, Math.min(nearestOnPiece.y, placement.y + placement.height))
      };
      line(svg, nearestOnTag.x, nearestOnTag.y, nearestOnPiece.x, nearestOnPiece.y, 'remnant-comparison-dimension-leader');
    }

  const group = svgElement('g', {
      class: 'remnant-comparison-dimension-tag',
      'data-dimension-label': 'true',
      'data-placement': placement.fallback ? 'fallback' : placement.outside ? 'leader' : 'inside',
      'aria-label': labelText,
      transform: placement.rotation ? `rotate(${placement.rotation} ${placement.cx} ${placement.cy})` : undefined
    });
    group.appendChild(svgElement('rect', {
      class: 'remnant-comparison-dimension-label-bg',
      x: placement.cx - labelWidth / 2,
      y: placement.cy - labelHeight / 2,
      width: labelWidth,
      height: labelHeight
    }));
    const text = svgElement('text', {
      class: 'remnant-comparison-dimension-label-text',
      x: placement.cx,
      y: placement.cy,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'font-size': fontPx * unitsPerPixel
    });
    text.textContent = labelText;
    group.appendChild(text);
    svg.appendChild(group);
    priorLabels.push({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
  }

  function createDisplayBoardGraphic(candidate, candidateNumber, panel, model) {
    const svg = svgElement('svg', {
      class: 'remnant-comparison-board-graphic',
      viewBox: `0 0 ${model.panelWidth} ${model.panelHeight}`,
      role: 'img',
      'aria-label': t(`方案 ${candidateNumber} 虛擬展示板 ${panel.displayBoardIndex + 1}；每件標示 R 編號及闊乘長尺寸`, `Scheme ${candidateNumber}, virtual display board ${panel.displayBoardIndex + 1}; each remnant is numbered and dimensioned width by length`),
      preserveAspectRatio: 'xMidYMid meet'
    });
    const viewportWidth = Number(root.innerWidth) || 320;
    const compactSingleColumn = viewportWidth <= 420;
    const targetPanelWidthPx = Math.min(425, Math.max(110,
      (viewportWidth - (compactSingleColumn ? 36 : 72)) / (compactSingleColumn ? 1 : 2)));
    const unitsPerPixel = model.panelWidth / targetPanelWidthPx;
    const fontPx = Math.max(6.4, Math.min(7.8, 6.4 + (viewportWidth - 320) * 0.0012));
    const boardX = model.padding, boardY = model.padding;
    const boardWidth = Math.min(panel.boardLength, panel.boardWidth);
    const boardHeight = Math.max(panel.boardLength, panel.boardWidth);
    const sourceBoard = candidate.plan.boards[0] || {};
    const overallWidth = formatDimension(boardWidth, sourceBoard);
    const overallHeight = formatDimension(boardHeight, sourceBoard);
    const widthLabel = t(`闊 ${overallWidth}`, `W ${overallWidth}`);
    const heightLabel = t(`高 ${overallHeight}`, `H ${overallHeight}`);
    svg.setAttribute('aria-label', t(
      `方案 ${candidateNumber} 虛擬展示板 ${panel.displayBoardIndex + 1}，整體闊 ${overallWidth}、高 ${overallHeight}；每件餘料標示 R 編號及闊乘長尺寸`,
      `Scheme ${candidateNumber}, virtual display board ${panel.displayBoardIndex + 1}, overall width ${overallWidth} and height ${overallHeight}; each remnant is numbered and dimensioned width by length`
    ));
    svg.appendChild(svgElement('rect', {
      class: 'remnant-comparison-board',
      x: boardX,
      y: boardY,
      width: boardWidth,
      height: boardHeight
    }));
    appendOverallDimensionTag(svg, boardX + boardWidth / 2, boardY - model.gap / 2,
      widthLabel, fontPx, unitsPerPixel, 0, 'width');
    appendOverallDimensionTag(svg, boardX - model.gap / 2, boardY + boardHeight / 2,
      heightLabel, fontPx, unitsPerPixel, -90, 'height');

    // Draw the exact remnant shapes at their virtual packed positions; these are not source-sheet locations.
    const pieces = panel.remnants.map(remnant => {
      const shape = remnant.display;
      const portraitShape = root.PlywoodRemnantComparison.portraitRect(shape, panel.boardLength, panel.boardWidth);
      const piece = {
        remnant,
        x: boardX + portraitShape.x,
        y: boardY + portraitShape.y,
        width: portraitShape.width,
        height: portraitShape.height
      };
      svg.appendChild(svgElement('rect', {
        class: 'remnant-comparison-piece',
        x: piece.x,
        y: piece.y,
        width: piece.width,
        height: piece.height,
        'data-remnant-id': remnant.materialId == null ? '' : remnant.materialId,
        'data-remnant-label': remnant.displayId || '',
        'data-original-source-board-index': remnant.sourceBoardIndex,
        'data-width': remnant.rect.width,
        'data-length': remnant.rect.length
      }));
      return piece;
    });
    const labelBoxes = [];
    pieces.forEach(piece => {
      appendDimensionTag(
        svg,
        piece,
        pieces,
        labelBoxes,
        `${piece.remnant.displayId || ''} · ${formatRemnantDimensions(candidate, piece.remnant)}`,
        fontPx,
        unitsPerPixel,
        model.gap,
        model.panelWidth,
        model.panelHeight
      );
    });
    return svg;
  }

  function createSchemeGraphic(candidate, candidateNumber, model) {
    const graphic = doc.createElement('span');
    graphic.className = 'remnant-comparison-graphic';
    graphic.dataset.sourceBoardCount = String(candidate.sourceBoardCount);
    graphic.dataset.displayBoardCount = String(candidate.displayBoardCount);
    candidate.panels.forEach(panel => {
      const panelElement = doc.createElement('span');
      panelElement.className = 'remnant-comparison-display-board-panel';
      panelElement.dataset.displayBoardIndex = String(panel.displayBoardIndex);
      const title = doc.createElement('span');
      title.className = 'remnant-comparison-display-board-title';
      title.textContent = t(`虛擬展示板 ${panel.displayBoardIndex + 1}`, `Virtual display board ${panel.displayBoardIndex + 1}`);
      panelElement.append(title, createDisplayBoardGraphic(candidate, candidateNumber, panel, model));
      graphic.appendChild(panelElement);
    });
    return graphic;
  }

  function render() {
    const button = $('openRemnantComparison'), action = $('remnantComparisonAction'), availability = $('remnantComparisonAvailability'), dialog = $('remnantComparisonDialog'), content = $('remnantComparisonContent');
    if (!button || !dialog || !content || !root.PlywoodRemnantComparison) return;
    const app = root.calculator;
    const allCandidates = validatedCandidates();
    const candidates = root.PlywoodRemnantComparison.minimumSourceSheetCandidates(allCandidates);
    const model = root.PlywoodRemnantComparison.layout(candidates, { gap: DISPLAY_GAP, padding: DISPLAY_PADDING });
    const count = candidates.length;
    const minimumSheetCount = count ? candidates[0].plan.boards.length : 0;
    button.disabled = count === 0;
    if (action) action.hidden = count === 0;
    button.textContent = count
      ? t(`比較最少用板餘料圖（${count}）`, `Compare fewest-sheet remnants (${count})`)
      : t('比較所有方案餘料圖', 'Compare all remnant layouts');
    button.setAttribute('aria-label', button.textContent);
    if (availability) availability.textContent = count
      ? t(`共 ${allCandidates.length} 個有效方案；只比較最少用板的 ${count} 個（每個實際用 ${minimumSheetCount} 張原板）。`, `${allCandidates.length} verified schemes; comparing only the ${count} using the fewest sheets (${minimumSheetCount} actual source sheet${minimumSheetCount === 1 ? '' : 's'} each).`)
      : t('載入 JSON 後按「計算」，再按此鈕比較餘料圖。', 'Load JSON, press “Calculate”, then tap here to compare remnants.');
    content.replaceChildren();
    const intro = $('remnantComparisonIntro');
    if (intro) intro.textContent = t(
      '按比例排餘料；只比最少用板，點圖看切割圖。',
      'Pack to scale; fewest-sheet schemes only. Tap a card for cuts.'
    );
    if (!count) {
      const empty = doc.createElement('p');
      empty.className = 'remnant-comparison-empty';
      empty.textContent = t('目前沒有通過驗證的方案可比較。', 'No validated scheme is available to compare.');
      content.appendChild(empty);
      return;
    }

    model.candidates.forEach((candidate, index) => {
      const candidateNumber = index + 1;
      const schemeButton = doc.createElement('button');
      schemeButton.type = 'button';
      schemeButton.className = 'remnant-comparison-scheme-button';
      schemeButton.dataset.schemeIndex = String(candidate.candidateIndex);
      schemeButton.dataset.current = String(candidate.plan === app.trialPlan);
      const remnantCountLabel = t(`${candidate.remnants.length} 件餘料`, `${candidate.remnants.length} remnant${candidate.remnants.length === 1 ? '' : 's'}`);
      const boardCountLabel = t(`實際用 ${candidate.sourceBoardCount} 張原板`, `${candidate.sourceBoardCount} original sheet${candidate.sourceBoardCount === 1 ? '' : 's'} actually used`);
      schemeButton.setAttribute('aria-label', t(`返回方案 ${candidateNumber} 彩色切割圖；${boardCountLabel}；${remnantCountLabel}`, `Return to scheme ${candidateNumber} colored cutting diagram; ${boardCountLabel}; ${remnantCountLabel}`));

      const heading = doc.createElement('span');
      heading.className = 'remnant-comparison-scheme-heading';
      const title = doc.createElement('span');
      title.className = 'remnant-comparison-scheme-title';
      title.textContent = t(`方案 ${candidateNumber}`, `Scheme ${candidateNumber}`);
      const countText = doc.createElement('span');
      countText.className = 'remnant-comparison-scheme-count';
      countText.textContent = boardCountLabel;
      heading.append(title, countText);
      schemeButton.appendChild(heading);

      const graphic = createSchemeGraphic(candidate, candidateNumber, model);
      if (!candidate.remnants.length) {
        const empty = doc.createElement('span');
        empty.className = 'remnant-comparison-no-remnants';
        empty.textContent = t('沒有完整餘料', 'No intact remnants');
        graphic.appendChild(empty);
      }
      schemeButton.appendChild(graphic);
      schemeButton.addEventListener('click', () => returnToCandidate(candidate));
      content.appendChild(schemeButton);
    });

    const footnote = doc.createElement('p');
    footnote.className = 'remnant-comparison-footnote';
    footnote.textContent = t('虛擬展示板上的擺位不是原板實際位置；尺寸標籤只供識別，不會加上切割線或改變餘料形狀。方案餘料不會自動加入實物庫存。', 'Placements on virtual display boards are not the remnants’ actual source-sheet locations. Dimension labels are annotations only; no cut-like guide lines are added and remnant shapes are unchanged. Candidate remnants are not added to physical stock automatically.');
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
