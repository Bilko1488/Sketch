// ==UserScript==
// @name         StratSketch Bilko
// @namespace    bilko
// @version      1.0.0
// @match        *://stratsketch.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Bilko1488/Sketch/main/StratSketch%20Bilko-1.0.0.user.js
// @downloadURL  https://raw.githubusercontent.com/Bilko1488/Sketch/main/StratSketch%20Bilko-1.0.0.user.js
// ==/UserScript==

(function() {
  'use strict';
  console.log('[Bilko] v6.3 starting');

  const GITHUB = 'https://raw.githubusercontent.com/Bilko1488/Sketch/main/';
  const CAPTURE_URL = GITHUB + 'capture-points-data.json';

  const MAP_OVERRIDES = {
    'oasis_palms':      GITHUB + '09_savanna_sv_2k.png',
    'canal':            GITHUB + '18_canal_cn_2k.png',
    'winter_malinovka': GITHUB + '12_malinovka_ma_2k.png',
    'desert_sands':     GITHUB + '02_desert_train_dt_2k.png',
  };

  const MAP_NAMES = {
    'black_goldville':'21_mountain_mnt','canal':'18_canal_cn','castilla':'13_pliego_pl',
    'copperfield':'23_karieri_kr','dead_rail':'04_medvedkovo_md','desert_sands':'02_desert_train_dt',
    'falls_creek':'05_amigosville_am','fort_despair':'07_fort_ft','himmelsdorf':'19_himmelsdorf_hm',
    'middleburg':'03_erlenberg_er','mines':'06_rudniki_rd','oasis_palms':'09_savanna_sv',
    'port_bay':'14_port_pt','rockfield':'17_karelia_ka','winter_malinovka':'12_malinovka_ma',
    'vineyards':'22_italy_it','yamato_harbor':'24_milibase_mlb','canyon':'25_canyon_ca',
    'mayan_ruins':'28_rock_rc','naval_frontier':'29_skit_sk','dynastys_pearl':'30_grossberg_sh',
    'alpenstadt':'31_lumber_lm','faust':'32_faust_fa_night','normandy':'33_neptune_nt',
    'new_bay':'34_forgecity_fc','hellas':'35_rift_rt','yukon':'08_idle_id',
    'ghost_factory':'11_plant_pn','molendijk':'16_holland_hl','lagoon':'15_lagoon_ln'
  };
  const GAME_TO_SS = {};
  for (const k of Object.keys(MAP_NAMES)) GAME_TO_SS[MAP_NAMES[k]] = k;

  const DEFAULT_SETTINGS = { enabled:true, replaceMaps:true, replacePoints:true, alpha:75 };
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(localStorage.getItem('__bilkoSettings') || '{}');
    settings = Object.assign(settings, saved);
  } catch(e){}
  function saveSettings() {
    try { localStorage.setItem('__bilkoSettings', JSON.stringify(settings)); } catch(e){}
  }

  // Сохранение позиций элементов
  let guiPos = { btnX:1060, btnY:14, panelX:1060, panelY:54 };
  try {
    const gp = JSON.parse(localStorage.getItem('__bilkoGuiPos') || '{}');
    guiPos = Object.assign(guiPos, gp);
  } catch(e){}
  function saveGuiPos() {
    try { localStorage.setItem('__bilkoGuiPos', JSON.stringify(guiPos)); } catch(e){}
  }

  const COLORS_BASE = { A:[231,76,60], B:[52,152,219], C:[46,204,113], D:[243,156,18] };
  let mapData = {};
  const overrideImages = {};
  const state = { mapName:null, T:null, refCanvas:null, mode:null, seenABC:false };

  function gameToNorm(gx, gy) {
    return [(gx + 300) / 600, 1 - (gy + 300) / 600];
  }

  function buildMapData(capture) {
    const result = {};
    for (const ssName of Object.keys(MAP_NAMES)) {
      const gk = MAP_NAMES[ssName];
      const g = capture[gk];
      if (!g || !g.strategicPoints || g.strategicPoints.length < 2) continue;
      const sorted = g.strategicPoints.slice().sort(function(a, b) { return a.baseID - b.baseID; });
      const labels = ['A','B','C','D'];
      const points = [];
      for (let i = 0; i < sorted.length && i < 4; i++) {
        const p = sorted[i];
        points.push({ label: labels[i], norm: gameToNorm(p.position[0], p.position[1]) });
      }
      result[ssName] = { points: points };
    }
    return result;
  }

  // === Drag helper ===
  // Возвращает true если это был drag (не click)
  function makeDraggable(el, onMove, onDragEnd) {
    let startX, startY, startElX, startElY, dragging = false, moved = false;

    el.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startElX = rect.left;
      startElY = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      const nx = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  startElX + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startElY + dy));
      el.style.left = nx + 'px';
      el.style.top  = ny + 'px';
      onMove && onMove(nx, ny);
    });

    document.addEventListener('mouseup', function(e) {
      if (!dragging) return;
      dragging = false;
      if (moved) onDragEnd && onDragEnd();
    });

    // Возвращает был ли реальный drag при клике
    el.__wasDragged = function() { return moved; };
  }

  function installHook(ctx) {
    if (ctx.__bilkoV6) return;
    ctx.__bilkoV6 = true;
    const origDraw = ctx.drawImage;
    ctx.drawImage = function(img) {
      try {
        if (!settings.enabled) return origDraw.apply(this, arguments);
        if (img instanceof HTMLImageElement && img.src) {
          if (/\/icons\/flag_neutral\.webp/.test(img.src)) {
            if (!state.seenABC) state.mode = 'encounter';
            return origDraw.apply(this, arguments);
          }
          if (/\/icons\/flag[abcd]_neutral\.webp/.test(img.src)) {
            state.mode = 'supremacy'; state.seenABC = true;
            if (settings.replacePoints) return;
            return origDraw.apply(this, arguments);
          }
          const m = img.src.match(/\/(?:img\/games\/wotb\/maps|maps|Sketch\/main)\/([^/?]+?)(?:_2k)?\.(?:webp|png)/);
          if (m && this.canvas.width >= 400) {
            const raw = m[1];
            const ssName = mapData[raw] ? raw : (GAME_TO_SS[raw] || null);
            let drawImg = img;
            if (settings.replaceMaps && ssName && overrideImages[ssName]) drawImg = overrideImages[ssName];
            const args = Array.prototype.slice.call(arguments, 1);
            const r = origDraw.apply(this, [drawImg].concat(args));
            if (ssName && mapData[ssName]) {
              state.mapName = ssName;
              state.T = this.getTransform();
              state.refCanvas = this.canvas;
              state.seenABC = false;
            }
            return r;
          }
        }
      } catch(e){}
      return origDraw.apply(this, arguments);
    };
  }

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type) {
    const ctx = origGetContext.apply(this, arguments);
    if (type === '2d' && ctx) installHook(ctx);
    return ctx;
  };

  function getOverlay() {
    let ov = document.querySelector('.__bilko-capture-ov');
    if (!ov) {
      const canvases = document.querySelectorAll('.EditorUI_stage__5aA_n .Canvas_canvas__X35DQ');
      if (canvases.length < 2) return null;
      ov = document.createElement('canvas');
      ov.className = '__bilko-capture-ov';
      ov.style.cssText = 'position:absolute;pointer-events:none;left:0;top:0;';
      canvases[0].parentElement.insertBefore(ov, canvases[1]);
    }
    return ov;
  }

  function renderMarkers() {
    const ov = getOverlay();
    if (!ov) return;
    const ctx = ov.getContext('2d');
    if (!settings.enabled || !settings.replacePoints || state.mode !== 'supremacy' || !state.mapName || !state.T || !state.refCanvas) {
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0, 0, ov.width || 1, ov.height || 1);
      return;
    }
    const t = mapData[state.mapName];
    if (!t) { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, ov.width || 1, ov.height || 1); return; }

    const rr = state.refCanvas.getBoundingClientRect();
    const pr = ov.parentElement.getBoundingClientRect();
    if (ov.width !== state.refCanvas.width) ov.width = state.refCanvas.width;
    if (ov.height !== state.refCanvas.height) ov.height = state.refCanvas.height;
    ov.style.left = (rr.left - pr.left) + 'px';
    ov.style.top  = (rr.top  - pr.top)  + 'px';
    ov.style.width  = rr.width  + 'px';
    ov.style.height = rr.height + 'px';

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.globalAlpha = settings.alpha / 100;

    const M = state.T;
    const scale = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c));
    const R = Math.max(8, Math.min(40, scale * 0.030));

    for (const p of t.points) {
      const x = M.a * p.norm[0] + M.c * p.norm[1] + M.e;
      const y = M.b * p.norm[0] + M.d * p.norm[1] + M.f;
      const c = COLORS_BASE[p.label];

      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();

      ctx.font = '900 ' + Math.round(R * 1.2) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, R * 0.15);
      ctx.strokeStyle = '#000';
      ctx.strokeText(p.label, x, y + 1);
      ctx.fillStyle = '#fff';
      ctx.fillText(p.label, x, y + 1);
    }
    ctx.globalAlpha = 1;
  }

  function loop() { renderMarkers(); requestAnimationFrame(loop); }

  document.addEventListener('click', function(e) {
    const slide = e.target.closest && e.target.closest('[class*="SlideItem_slide--preview"]');
    if (!slide) return;
    setTimeout(function() {
      const stage = document.querySelector('.EditorUI_stage__5aA_n');
      if (!stage) return;
      const o = { bubbles:true, cancelable:true, clientX:900, clientY:400, ctrlKey:true };
      stage.dispatchEvent(new WheelEvent('wheel', Object.assign({}, o, {deltaY: 0.01})));
      stage.dispatchEvent(new WheelEvent('wheel', Object.assign({}, o, {deltaY:-0.01})));
    }, 60);
  }, true);

  function forceRedraw() {
    const stage = document.querySelector('.EditorUI_stage__5aA_n');
    if (!stage) return;
    const o = { bubbles:true, cancelable:true, clientX:900, clientY:400, ctrlKey:true };
    stage.dispatchEvent(new WheelEvent('wheel', Object.assign({}, o, {deltaY: 0.01})));
    stage.dispatchEvent(new WheelEvent('wheel', Object.assign({}, o, {deltaY:-0.01})));
  }

  function buildGUI() {
    if (document.querySelector('.__bilko-gui-btn')) return;

    // === Кнопка ===
    const btn = document.createElement('button');
    btn.className = '__bilko-gui-btn';
    btn.title = 'StratSketch Fix v1';
    btn.innerHTML = '⚙';
    btn.style.cssText = 'position:fixed;z-index:99999;background:#1a1a2e;color:#e0e0ff;border:1px solid #4a4a8a;border-radius:6px;width:32px;height:32px;font-size:18px;cursor:grab;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);user-select:none;';
    btn.style.left = guiPos.btnX + 'px';
    btn.style.top  = guiPos.btnY + 'px';
    btn.onmouseenter = function(){ if (!btn.__dragging) btn.style.background = '#2a2a5e'; };
    btn.onmouseleave = function(){ btn.style.background = '#1a1a2e'; };
    document.body.appendChild(btn);

    // === Панель ===
    const panel = document.createElement('div');
    panel.className = '__bilko-gui-panel';
    panel.style.cssText = 'position:fixed;z-index:99999;background:#12121e;color:#e0e0ff;border:1px solid #3a3a6a;border-radius:10px;padding:0;width:230px;font-family:Arial,sans-serif;font-size:13px;display:none;box-shadow:0 6px 24px rgba(0,0,0,0.6);overflow:hidden;user-select:none;';
    panel.style.left = guiPos.panelX + 'px';
    panel.style.top  = guiPos.panelY + 'px';
    panel.innerHTML =
      '<div id="bk-panel-header" style="background:linear-gradient(135deg,#1e1e4e,#2a1a4e);padding:12px 14px 10px;border-bottom:1px solid #3a3a6a;cursor:grab;">' +
        '<div style="font-weight:700;font-size:15px;color:#c0aaff;letter-spacing:0.5px;">StratSketch Fix <span style="font-size:11px;color:#8888bb;font-weight:400;">v1</span></div>' +
        '<div style="font-size:10px;color:#6666aa;margin-top:2px;">Map overlay tool · drag to move</div>' +
      '</div>' +
      '<div style="padding:12px 14px;">' +
        '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">' +
          '<label id="bk-l-en" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 8px;border-radius:6px;background:#1a1a30;border:1px solid #2a2a50;">' +
            '<input type="checkbox" id="bk-en" style="accent-color:#9b7fff;width:14px;height:14px;cursor:pointer;"><span>Включено</span>' +
          '</label>' +
          '<label id="bk-l-mp" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 8px;border-radius:6px;background:#1a1a30;border:1px solid #2a2a50;">' +
            '<input type="checkbox" id="bk-mp" style="accent-color:#9b7fff;width:14px;height:14px;cursor:pointer;"><span>Заменять карты</span>' +
          '</label>' +
          '<label id="bk-l-pt" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 8px;border-radius:6px;background:#1a1a30;border:1px solid #2a2a50;">' +
            '<input type="checkbox" id="bk-pt" style="accent-color:#9b7fff;width:14px;height:14px;cursor:pointer;"><span>Заменять точки</span>' +
          '</label>' +
        '</div>' +
        '<div style="background:#1a1a30;border:1px solid #2a2a50;border-radius:6px;padding:8px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<span style="color:#aaaacc;font-size:12px;">Прозрачность точек</span>' +
            '<span id="bk-av" style="color:#c0aaff;font-weight:700;font-size:13px;">75%</span>' +
          '</div>' +
          '<input type="range" id="bk-a" min="10" max="100" step="5" style="width:100%;accent-color:#9b7fff;cursor:pointer;">' +
        '</div>' +
      '</div>' +
      '<div style="border-top:1px solid #2a2a50;padding:7px 14px;text-align:center;color:#44446a;font-size:10px;letter-spacing:0.5px;">Created by Bilko</div>';
    document.body.appendChild(panel);

    // === Drag кнопки ===
    makeDraggable(btn,
      function(x, y) {
        guiPos.btnX = x; guiPos.btnY = y;
        btn.style.cursor = 'grabbing';
      },
      function() {
        btn.style.cursor = 'grab';
        saveGuiPos();
      }
    );

    // === Drag панели за шапку ===
    const header = panel.querySelector('#bk-panel-header');
    makeDraggable(header,
      function(x, y) {
        // header drag → двигаем panel
        const rect = panel.getBoundingClientRect();
        const hRect = header.getBoundingClientRect();
        const offX = hRect.left - rect.left;
        const offY = hRect.top  - rect.top;
        const nx = Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  x - offX));
        const ny = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, y - offY));
        panel.style.left = nx + 'px';
        panel.style.top  = ny + 'px';
        header.style.cursor = 'grabbing';
      },
      function() {
        header.style.cursor = 'grab';
        guiPos.panelX = parseInt(panel.style.left);
        guiPos.panelY = parseInt(panel.style.top);
        saveGuiPos();
      }
    );

    // makeDraggable для header двигает header, а не panel — перепишем отдельно
    // (header — child panel, поэтому нужен отдельный handler)
    (function() {
      let sx, sy, spx, spy, dragging = false, moved = false;
      header.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        dragging = true; moved = false;
        sx = e.clientX; sy = e.clientY;
        spx = parseInt(panel.style.left) || 0;
        spy = parseInt(panel.style.top)  || 0;
        e.preventDefault();
      });
      document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        header.style.cursor = 'grabbing';
        const nx = Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  spx + dx));
        const ny = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, spy + dy));
        panel.style.left = nx + 'px';
        panel.style.top  = ny + 'px';
      });
      document.addEventListener('mouseup', function() {
        if (!dragging) return;
        dragging = false;
        header.style.cursor = 'grab';
        if (moved) {
          guiPos.panelX = parseInt(panel.style.left);
          guiPos.panelY = parseInt(panel.style.top);
          saveGuiPos();
        }
      });
      header.__panelMoved = function() { return moved; };
    })();

    // === Клик по кнопке (только если не было drag) ===
    btn.addEventListener('click', function() {
      if (btn.__wasDragged && btn.__wasDragged()) return;
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      if (!open) {
        // Открываем рядом с кнопкой если панель за экраном
        const bx = parseInt(btn.style.left) || guiPos.btnX;
        const by = parseInt(btn.style.top)  || guiPos.btnY;
        const px = Math.min(bx, window.innerWidth  - 240);
        const py = Math.min(by + 38, window.innerHeight - 300);
        if (guiPos.panelX === 1060 && guiPos.panelY === 54) {
          panel.style.left = px + 'px';
          panel.style.top  = py + 'px';
        }
      }
    });

    // === Hover на лейблах ===
    ['bk-l-en','bk-l-mp','bk-l-pt'].forEach(function(id) {
      const el = panel.querySelector('#' + id);
      el.onmouseenter = function(){ el.style.background = '#22223a'; };
      el.onmouseleave = function(){ el.style.background = '#1a1a30'; };
    });

    const $en = panel.querySelector('#bk-en');
    const $mp = panel.querySelector('#bk-mp');
    const $pt = panel.querySelector('#bk-pt');
    const $a  = panel.querySelector('#bk-a');
    const $av = panel.querySelector('#bk-av');

    function refresh() {
      $en.checked = settings.enabled;
      $mp.checked = settings.replaceMaps;
      $pt.checked = settings.replacePoints;
      $a.value = settings.alpha;
      $av.textContent = settings.alpha + '%';
    }
    refresh();

    $en.onchange = function(){ settings.enabled       = $en.checked; saveSettings(); forceRedraw(); };
    $mp.onchange = function(){ settings.replaceMaps   = $mp.checked; saveSettings(); forceRedraw(); };
    $pt.onchange = function(){ settings.replacePoints = $pt.checked; saveSettings(); forceRedraw(); };
    $a.oninput   = function(){ settings.alpha = parseInt($a.value, 10); $av.textContent = settings.alpha + '%'; saveSettings(); };
  }

  async function init() {
    try {
      const capture = await fetch(CAPTURE_URL, {cache:'no-cache'}).then(function(r){ return r.json(); });
      mapData = buildMapData(capture);
      await Promise.all(Object.keys(MAP_OVERRIDES).map(function(ss) {
        return new Promise(function(r) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = function(){ overrideImages[ss] = img; r(); };
          img.onerror = function(){ r(); };
          img.src = MAP_OVERRIDES[ss];
        });
      }));
      console.log('[Bilko] Ready: maps=' + Object.keys(mapData).length + ', overrides=' + Object.keys(overrideImages).length);
      buildGUI();
      setInterval(buildGUI, 2000);
      loop();
    } catch(e) { console.error('[Bilko] init error:', e); }
  }

  init();
})();
