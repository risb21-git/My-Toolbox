'use strict';
/* ToolBox – client-side tools. To add a tool, push a new object into TOOLS (see bottom of file). */

const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib || {};
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ---------- helpers ---------- */
const fmtBytes = n => {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
};
const baseName = n => n.replace(/\.[^.]+$/, '');
const need = (lib, name) => { if (!lib) throw new Error(name + ' failed to load. Check your internet connection and reload.'); };

function saveAs(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function addResult(out, blob, filename, note = '') {
  const url = URL.createObjectURL(blob);
  const row = document.createElement('div');
  row.className = 'result';
  const isImg = blob.type.startsWith('image/');
  row.innerHTML = (isImg ? `<img class="thumb" src="${url}" alt="">` : '') +
    '<div class="rinfo"><div class="fn"></div><div class="muted"></div></div><a class="btn">Download</a>';
  row.querySelector('.fn').textContent = filename;
  row.querySelector('.muted').textContent = fmtBytes(blob.size) + (note ? ' · ' + note : '');
  const a = row.querySelector('a');
  a.href = url;
  a.download = filename;
  out.appendChild(row);
}

function addZipButton(out, zip, filename) {
  const b = document.createElement('button');
  b.className = 'primary';
  b.textContent = 'Download all as ZIP';
  b.onclick = async () => {
    b.disabled = true;
    saveAs(await zip.generateAsync({ type: 'blob' }), filename);
    b.disabled = false;
  };
  out.prepend(b);
}

function uniqueName(used, name) {
  let n = name, i = 1;
  const dot = name.lastIndexOf('.');
  while (used.has(n)) { n = name.slice(0, dot) + '-' + (++i) + name.slice(dot); }
  used.add(n);
  return n;
}

async function run(btn, st, fn) {
  btn.disabled = true;
  st.className = 'status';
  st.textContent = 'Working…';
  try {
    const msg = await fn();
    st.textContent = msg || 'Done ✔';
    st.classList.add('ok');
  } catch (e) {
    console.error(e);
    st.textContent = 'Error: ' + (e.message || e);
    st.classList.add('err');
  } finally {
    btn.disabled = false;
  }
}

function fileDrop({ accept = '', multiple = false, label = 'Choose file', onChange } = {}) {
  const el = document.createElement('div');
  el.innerHTML = `<div class="drop" tabindex="0"><strong>${label}</strong><span class="muted">Click or drag &amp; drop here</span></div>
    <input type="file" hidden ${multiple ? 'multiple' : ''} accept="${accept}"><ul class="flist"></ul>`;
  const drop = el.querySelector('.drop'), input = el.querySelector('input'), ul = el.querySelector('.flist');
  const api = { files: [], el };

  function draw() {
    ul.innerHTML = '';
    api.files.forEach((f, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="fn"></span><span class="muted"></span>';
      li.querySelector('.fn').textContent = f.name;
      li.querySelector('.muted').textContent = fmtBytes(f.size);
      if (multiple) {
        [['↑', -1], ['↓', 1], ['✕', 0]].forEach(([t, d]) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'mini'; b.textContent = t;
          b.onclick = () => {
            if (d === 0) api.files.splice(i, 1);
            else {
              const j = i + d;
              if (j < 0 || j >= api.files.length) return;
              [api.files[i], api.files[j]] = [api.files[j], api.files[i]];
            }
            changed();
          };
          li.appendChild(b);
        });
      }
      ul.appendChild(li);
    });
  }
  function changed() { draw(); if (onChange) onChange(api.files); }
  function add(list) {
    const fs = [...list];
    if (!fs.length) return;
    api.files = multiple ? api.files.concat(fs) : [fs[0]];
    changed();
  }
  drop.onclick = () => input.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { add(input.files); input.value = ''; };
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => add(e.dataTransfer.files));
  return api;
}

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Cannot read image: ' + file.name)); };
    img.src = url;
  });
}
const toBlob = (canvas, type, q) => new Promise((res, rej) =>
  canvas.toBlob(b => b ? res(b) : rej(new Error('Your browser cannot export ' + type)), type, q));

async function loadPdfLib(file) {
  need(PDFDocument, 'pdf-lib');
  return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
}
async function loadPdfJs(file) {
  need(window.pdfjsLib, 'pdf.js');
  return pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}
async function renderPage(pdf, n, scale, whiteBg = true) {
  const page = await pdf.getPage(n);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d');
  if (whiteBg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const base = page.getViewport({ scale: 1 });
  return { canvas: c, w: base.width, h: base.height };
}

/** "1-3, 5, 8-" -> zero-based page indexes */
function parseRanges(str, total) {
  const out = [];
  for (const part of str.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) {
      let a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : total;
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= total) out.push(i - 1);
    } else if (/^\d+$/.test(part)) {
      const n = +part;
      if (n >= 1 && n <= total) out.push(n - 1);
    } else throw new Error('Invalid page range: ' + part);
  }
  return out;
}

/* ---------- tools ---------- */
const TOOLS = [];

/* IMAGE ------------------------------------------------ */
TOOLS.push({
  id: 'image-compress', group: 'Image', icon: '🗜️', name: 'Compress / Resize / Convert Image',
  desc: 'Shrink JPG, PNG and WebP images, resize them, or change their format. Works on many files at once.',
  render(b) {
    b.innerHTML = `<div id="dz"></div>
      <div class="grid">
        <label>Quality: <b id="qv">75</b>%<input id="q" type="range" min="10" max="100" value="75"></label>
        <label>Max width in px (blank = keep)<input id="mw" type="number" min="16" placeholder="e.g. 1600"></label>
        <label>Output format<select id="fmt">
          <option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option>
          <option value="image/png">PNG (lossless, ignores quality)</option></select></label>
      </div>
      <button id="go" class="primary">Process images</button><span id="st" class="status"></span><div id="out"></div>`;
    const dz = fileDrop({ accept: 'image/*', multiple: true, label: 'Choose images' });
    b.querySelector('#dz').appendChild(dz.el);
    const q = b.querySelector('#q'), qv = b.querySelector('#qv');
    q.oninput = () => qv.textContent = q.value;
    const out = b.querySelector('#out');
    b.querySelector('#go').onclick = e => run(e.target, b.querySelector('#st'), async () => {
      if (!dz.files.length) throw new Error('Add at least one image first.');
      need(window.JSZip, 'JSZip');
      out.innerHTML = '';
      const fmt = b.querySelector('#fmt').value;
      const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[fmt];
      const mw = +b.querySelector('#mw').value;
      const zip = new JSZip(), used = new Set();
      let tin = 0, tout = 0;
      for (const f of dz.files) {
        const img = await loadImage(f);
        let w = img.naturalWidth, h = img.naturalHeight;
        if (mw > 0 && w > mw) { h = Math.round(h * mw / w); w = mw; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (fmt === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await toBlob(c, fmt, +q.value / 100);
        const name = uniqueName(used, baseName(f.name) + '-processed.' + ext);
        const saved = Math.round((1 - blob.size / f.size) * 100);
        addResult(out, blob, name, `${fmtBytes(f.size)} → ${fmtBytes(blob.size)} (${saved >= 0 ? '-' + saved : '+' + (-saved)}%)`);
        zip.file(name, blob);
        tin += f.size; tout += blob.size;
      }
      if (dz.files.length > 1) addZipButton(out, zip, 'images.zip');
      return `Done ✔  Total ${fmtBytes(tin)} → ${fmtBytes(tout)}`;
    });
  }
});

TOOLS.push({
  id: 'images-to-pdf', group: 'Image', icon: '🖼️', name: 'Images to PDF',
  desc: 'Combine JPG / PNG / WebP images into a single PDF. Use ↑ ↓ to set the page order.',
  render(b) {
    b.innerHTML = `<div id="dz"></div>
      <div class="grid">
        <label>Page size<select id="size"><option value="a4">A4 (image fitted inside)</option><option value="fit">Same size as image</option></select></label>
        <label>Margin on A4 (points)<input id="mg" type="number" value="20" min="0"></label>
      </div>
      <button id="go" class="primary">Create PDF</button><span id="st" class="status"></span><div id="out"></div>`;
    const dz = fileDrop({ accept: 'image/*', multiple: true, label: 'Choose images' });
    b.querySelector('#dz').appendChild(dz.el);
    const out = b.querySelector('#out');
    b.querySelector('#go').onclick = e => run(e.target, b.querySelector('#st'), async () => {
      if (!dz.files.length) throw new Error('Add at least one image first.');
      need(PDFDocument, 'pdf-lib');
      out.innerHTML = '';
      const pdf = await PDFDocument.create();
      const fit = b.querySelector('#size').value === 'fit';
      const mg = +b.querySelector('#mg').value || 0;
      for (const f of dz.files) {
        let emb;
        if (f.type === 'image/png') emb = await pdf.embedPng(await f.arrayBuffer());
        else if (f.type === 'image/jpeg') emb = await pdf.embedJpg(await f.arrayBuffer());
        else { // convert other formats through a canvas
          const img = await loadImage(f);
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          emb = await pdf.embedJpg(await (await toBlob(c, 'image/jpeg', 0.92)).arrayBuffer());
        }
        if (fit) {
          const p = pdf.addPage([emb.width, emb.height]);
          p.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
        } else {
          const W = 595.28, H = 841.89;
          const p = pdf.addPage([W, H]);
          const s = Math.min((W - 2 * mg) / emb.width, (H - 2 * mg) / emb.height, 1 * 10);
          const w = emb.width * s, h = emb.height * s;
          p.drawImage(emb, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
        }
      }
      const blob = new Blob([await pdf.save()], { type: 'application/pdf' });
      addResult(out, blob, 'images.pdf', dz.files.length + ' page(s)');
    });
  }
});

/* PDF -------------------------------------------------- */
TOOLS.push({
  id: 'pdf-merge', group: 'PDF', icon: '➕', name: 'Merge PDFs',
  desc: 'Join several PDF files into one. Use ↑ ↓ to set the order.',
  render(b) {
    b.innerHTML = `<div id="dz"></div><button id="go" class="primary">Merge</button><span id="st" class="status"></span><div id="out"></div>`;
    const dz = fileDrop({ accept: 'application/pdf', multiple: true, label: 'Choose PDF files' });
    b.querySelector('#dz').appendChild(dz.el);
    const out = b.querySelector('#out');
    b.querySelector('#go').onclick = e => run(e.target, b.querySelector('#st'), async () => {
      if (dz.files.length < 2) throw new Error('Add at least two PDFs.');
      out.innerHTML = '';
      const merged = await PDFDocument.create();
      for (const f of dz.files) {
        const src = await loadPdfLib(f);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      addResult(out, new Blob([await merged.save()], { type: 'application/pdf' }), 'merged.pdf', merged.getPageCount() + ' pages');
    });
  }
});

TOOLS.push({
  id: 'pdf-pages', group: 'PDF', icon: '✂️', name: 'Split / Extract / Delete Pages',
  desc: 'Pull out pages, remove pages, or split every page into its own PDF.',
  render(b) {
    b.innerHTML = `<div id="dz"></div>
      <div class="grid">
        <label>What to do<select id="mode">
          <option value="extract">Extract these pages into one PDF</option>
          <option value="delete">Delete these pages</option>
          <option value="split">Split every page (ZIP)</option></select></label>
        <label>Pages (e.g. 1-3, 5, 8-)<input id="rng" type="text" placeholder="1-3, 5"></label>
      </div>
      <p class="muted" id="info"></p>
      <button id="go" class="primary">Go</button><span id="st" class="status"></span><div id="out"></div>`;
    const info = b.querySelector('#info');
    const dz = fileDrop({
      accept: 'application/pdf', label: 'Choose a PDF',
      onChange: async fs => {
        info.textContent = '';
        if (!fs.length) return;
        try { info.textContent = 'This PDF has ' + (await loadPdfLib(fs[0])).getPageCount() + ' pages.'; } catch (e) { info.textContent = 'Could not read this PDF.'; }
      }
    });
    b.querySelector('#dz').appendChild(dz.el);
    const out = b.querySelector('#out');
    b.querySelector('#go').onclick = e => run(e.target, b.querySelector('#st'), async () => {
      if (!dz.files.length) throw new Error('Choose a PDF first.');
      out.innerHTML = '';
      const src = await loadPdfLib(dz.files[0]);
      const total = src.getPageCount();
      const mode = b.querySelector('#mode').value;
      const name = baseName(dz.files[0].name);
      if (mode === 'split') {
        need(window.JSZip, 'JSZip');
        const zip = new JSZip();
        const pad = String(total).length;
        for (let i = 0; i < total; i++) {
          const d = await PDFDocument.create();
          const [p] = await d.copyPages(src, [i]);
          d.addPage(p);
          zip.file(`${name}-page-${String(i + 1).padStart(pad, '0')}.pdf`, await d.save());
        }
        addZipButton(out, zip, name + '-pages.zip');
        return `Done ✔  ${total} files ready in the ZIP`;
      }
      let idx = [...new Set(parseRanges(b.querySelector('#rng').value, total))];
      if (!idx.length) throw new Error('Enter valid page numbers.');
      if (mode === 'delete') {
        const del = new Set(idx);
        idx = src.getPageIndices().filter(i => !del.has(i));
        if (!idx.length) throw new Error('You cannot delete every page.');
      } else idx.sort((a, c) => a - c);
      const d = await PDFDocument.create();
      (await d.copyPages(src, idx)).forEach(p => d.addPage(p));
      addResult(out, new Blob([await d.save()], { type: 'application/pdf' }), name + (mode === 'delete' ? '-trimmed' : '-extract') + '.pdf', idx.length + ' pages');
    });
  }
});

TOOLS.push({
  id: 'pdf-rotate', group: 'PDF', icon: '🔄', name: 'Rotate PDF Pages',
  desc: 'Rotate all pages, or only the pages you choose.',
  render(b) {
    b.innerHTML = `<div id="dz"></div>
      <div class="grid">
        <label>Rotate by<select id="ang"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° counter-clockwise</option></select></label>
        <label>Pages (blank = all)<input id="rng" type="text" placeholder="1-3, 5"></label>
      </div>
      <button id="go" class="primary">Rotate</button><span id="st" class="status"></span><div id="out"></div>`;
    const dz = fileDrop({ accept: 'application/pdf', label: 'Choose a PDF' });
    b.querySelector('#dz').appendChild(dz.el);
    const out = b.querySelector('#out');
    b.querySelector('#go').onclick = e => run(e.target, b.querySelector('#st'), async () => {
      if (!dz.files.length) throw new Error('Choose a PDF first.');
      out.innerHTML = '';
      const doc = await loadPdfLib(dz.files[0]);
      const total = doc.getPageCount();
      const r = b.querySelector('#rng').value.trim();
      const idx = r ? parseRanges(r, total) : doc.getPageIndices();
      const a = +b.querySelector('#ang').value;
      idx.forEach(i => { const p = doc.getPage(i); p.setRotation(degrees((p.getRotation().angle + a) % 360)); });
      addResult(out, new Blob([await doc.save()], { type: 'application/pdf' }), baseName(dz.files[0].name) + '-rotated.pdf');
    });
  }
});

TOOLS.push({
  id: 'pdf-compress', group: 'PDF', icon: '📉', name: 'Compress PDF (scanned / image-heavy)',
  desc: 'Re-renders each page as a JPEG to cut file size. Best for scans and photos. Text becomes an image (not selectable).',
  render(b) {
    b.innerHTML = `<div id="dz"></div>
      <div class="grid">
        <label>Resolution: <b id="dv">110</b> DPI<input id="dpi" type="range" min="50" max="200" step="10" value="110"></label>
        <label>JPEG quality: <b id="qv">65</b>%<input id="q" type="range" min="20" max="95" value="65"></label>
      </div>
      <button id="go" class="primary">Compress</button><span id="st" class="status"></span><div id="out"></div>`;
    const dz = fileDrop({ accept: 'application/pdf', label: 'Choose a PDF' });
    b.querySelector('#dz').appendChild(dz.el);
    const dpi = b.querySelector('#dpi'), q = b.querySelector('#q');
    dpi.oninput = () => b.querySelector('#dv').textContent = dpi.value;
    q.oninput = () => b.querySelector('#qv').textContent = q.value;
    const out = b.querySelector('#out'), st = b.querySelector('#st');
    b.querySelector('#go').onclick = e => run(e.target, st, async () => {
      if (!dz.files.length) throw new Error('Choose a PDF first.');
      need(PDFDocument, 'pdf-lib');
      out.innerHTML = '';
      const src = await loadPdfJs(dz.files[0]);
      const dst = await PDFDocument.create();
      for (let i = 1; i <= src.numPages; i++) {
        st.textContent = `Working… page ${i} of ${src.numPages}`;
        const { canvas, w, h } = await renderPage(src, i, +dpi.value / 72);
        const jpg = await dst.embedJpg(await (await toBlob(canvas, 'image/jpeg', +q.value / 100)).arrayBuffer());
        dst.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
      }
      const blob = new Blob([await dst.save()], { type: 'application/pdf' });
      const f = dz.files[0];
      if (blob.size >= f.size) {
        addResult(out, blob, baseName(f.name) + '-compressed.pdf', 'Not smaller than the original (' + fmtBytes(f.size) + ') – try lower DPI/quality or keep the original');
      } else {
        addResult(out, blob, baseName(f.name) + '-compressed.pdf', `${fmtBytes(f.size)} → ${fmtBytes(blob.size)}`);
      }
    });
  }
});

TOOLS.push({
  id: 'pdf-to-images', group: 'PDF', icon: '📷', name: 'PDF to Images',
  desc: 'Turn every PDF page into a PNG or JPG image.',
  render(b) {
    b.innerHTML = `<div id="dz"></div>
      <div class="grid">
        <label>Format<select id="fmt"><option value="image/png">PNG</option><option value="image/jpeg">JPG</option></select></label>
        <label>Resolution: <b id="dv">150</b> DPI<input id="dpi" type="range" min="72" max="300" step="6" value="150"></label>
      </div>
      <button id="go" class="primary">Convert</button><span id="st" class="status"></span><div id="out"></div>`;
    const dz = fileDrop({ accept: 'application/pdf', label: 'Choose a PDF' });
    b.querySelector('#dz').appendChild(dz.el);
    const dpi = b.querySelector('#dpi');
    dpi.oninput = () => b.querySelector('#dv').textContent = dpi.value;
    const out = b.querySelector('#out'), st = b.querySelector('#st');
    b.querySelector('#go').onclick = e => run(e.target, st, async () => {
      if (!dz.files.length) throw new Error('Choose a PDF first.');
      need(window.JSZip, 'JSZip');
      out.innerHTML = '';
      const pdf = await loadPdfJs(dz.files[0]);
      const fmt = b.querySelector('#fmt').value, ext = fmt === 'image/png' ? 'png' : 'jpg';
      const zip = new JSZip(), name = baseName(dz.files[0].name), pad = String(pdf.numPages).length;
      for (let i = 1; i <= pdf.numPages; i++) {
        st.textContent = `Working… page ${i} of ${pdf.numPages}`;
        const { canvas } = await renderPage(pdf, i, +dpi.value / 72);
        const blob = await toBlob(canvas, fmt, 0.92);
        const fn = `${name}-${String(i).padStart(pad, '0')}.${ext}`;
        zip.file(fn, blob);
        addResult(out, blob, fn);
      }
      if (pdf.numPages > 1) addZipButton(out, zip, name + '-images.zip');
    });
  }
});

TOOLS.push({
  id: 'pdf-to-text', group: 'PDF', icon: '📝', name: 'PDF to Text',
  desc: 'Extract the text from a PDF. (Scanned PDFs have no text layer, so they need OCR instead.)',
  render(b) {
    b.innerHTML = `<div id="dz"></div><button id="go" class="primary">Extract text</button><span id="st" class="status"></span>
      <textarea id="txt" placeholder="Extracted text appears here…"></textarea>
      <div class="btns"><button id="copy">Copy</button><button id="dl">Download .txt</button></div>`;
    const dz = fileDrop({ accept: 'application/pdf', label: 'Choose a PDF' });
    b.querySelector('#dz').appendChild(dz.el);
    const txt = b.querySelector('#txt'), st = b.querySelector('#st');
    b.querySelector('#go').onclick = e => run(e.target, st, async () => {
      if (!dz.files.length) throw new Error('Choose a PDF first.');
      const pdf = await loadPdfJs(dz.files[0]);
      const parts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        st.textContent = `Working… page ${i} of ${pdf.numPages}`;
        const tc = await (await pdf.getPage(i)).getTextContent();
        parts.push(`--- Page ${i} ---\n` + tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
      }
      txt.value = parts.join('\n\n');
      if (!txt.value.replace(/--- Page \d+ ---/g, '').trim()) return 'No text found – this PDF is probably scanned.';
    });
    b.querySelector('#copy').onclick = () => navigator.clipboard.writeText(txt.value);
    b.querySelector('#dl').onclick = () => saveAs(new Blob([txt.value], { type: 'text/plain' }), (dz.files[0] ? baseName(dz.files[0].name) : 'text') + '.txt');
  }
});

TOOLS.push({
  id: 'pdf-numbers', group: 'PDF', icon: '🔢', name: 'Add Page Numbers',
  desc: 'Stamp "1 / N" style page numbers at the bottom of every page.',
  render(b) {
    b.innerHTML = `<div id="dz"></div>
      <div class="grid">
        <label>Position<select id="pos"><option value="c">Bottom centre</option><option value="r">Bottom right</option><option value="l">Bottom left</option></select></label>
        <label>Start numbering at<input id="start" type="number" value="1"></label>
        <label>Format<select id="f"><option value="n">1</option><option value="nn">1 / N</option></select></label>
      </div>
      <button id="go" class="primary">Add numbers</button><span id="st" class="status"></span><div id="out"></div>`;
    const dz = fileDrop({ accept: 'application/pdf', label: 'Choose a PDF' });
    b.querySelector('#dz').appendChild(dz.el);
    const out = b.querySelector('#out');
    b.querySelector('#go').onclick = e => run(e.target, b.querySelector('#st'), async () => {
      if (!dz.files.length) throw new Error('Choose a PDF first.');
      out.innerHTML = '';
      const doc = await loadPdfLib(dz.files[0]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const start = +b.querySelector('#start').value || 1, pos = b.querySelector('#pos').value, f = b.querySelector('#f').value;
      const n = doc.getPageCount();
      doc.getPages().forEach((p, i) => {
        const { width } = p.getSize();
        const t = f === 'n' ? String(start + i) : `${start + i} / ${start + n - 1}`;
        const tw = font.widthOfTextAtSize(t, 10);
        const x = pos === 'c' ? (width - tw) / 2 : pos === 'r' ? width - tw - 30 : 30;
        p.drawText(t, { x, y: 20, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
      });
      addResult(out, new Blob([await doc.save()], { type: 'application/pdf' }), baseName(dz.files[0].name) + '-numbered.pdf');
    });
  }
});

TOOLS.push({
  id: 'pdf-watermark', group: 'PDF', icon: '💧', name: 'Add Text Watermark',
  desc: 'Place a diagonal text watermark (e.g. CONFIDENTIAL) on every page. Latin characters only.',
  render(b) {
    b.innerHTML = `<div id="dz"></div>
      <div class="grid">
        <label>Text<input id="t" type="text" value="CONFIDENTIAL"></label>
        <label>Size<input id="s" type="number" value="60" min="10"></label>
        <label>Opacity: <b id="ov">0.25</b><input id="o" type="range" min="0.05" max="0.8" step="0.05" value="0.25"></label>
      </div>
      <button id="go" class="primary">Add watermark</button><span id="st" class="status"></span><div id="out"></div>`;
    const dz = fileDrop({ accept: 'application/pdf', label: 'Choose a PDF' });
    b.querySelector('#dz').appendChild(dz.el);
    const o = b.querySelector('#o');
    o.oninput = () => b.querySelector('#ov').textContent = o.value;
    const out = b.querySelector('#out');
    b.querySelector('#go').onclick = e => run(e.target, b.querySelector('#st'), async () => {
      if (!dz.files.length) throw new Error('Choose a PDF first.');
      out.innerHTML = '';
      const doc = await loadPdfLib(dz.files[0]);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const text = b.querySelector('#t').value, size = +b.querySelector('#s').value || 60;
      const tw = font.widthOfTextAtSize(text, size);
      doc.getPages().forEach(p => {
        const { width, height } = p.getSize();
        // centre the text on the page after rotating 45° around its start point
        const a = Math.PI / 4;
        p.drawText(text, {
          x: width / 2 - (tw / 2) * Math.cos(a) + (size / 3) * Math.sin(a),
          y: height / 2 - (tw / 2) * Math.sin(a) - (size / 3) * Math.cos(a),
          size, font, color: rgb(0.5, 0.5, 0.5), opacity: +o.value, rotate: degrees(45)
        });
      });
      addResult(out, new Blob([await doc.save()], { type: 'application/pdf' }), baseName(dz.files[0].name) + '-watermarked.pdf');
    });
  }
});

/* TEXT & DEV ------------------------------------------- */
TOOLS.push({
  id: 'word-counter', group: 'Text & Dev', icon: '🔤', name: 'Word Counter',
  desc: 'Count words, characters, sentences and reading time.',
  render(b) {
    b.innerHTML = `<textarea id="t" placeholder="Type or paste text…"></textarea><div class="stats" id="s"></div>`;
    const t = b.querySelector('#t'), s = b.querySelector('#s');
    const upd = () => {
      const v = t.value;
      const words = (v.match(/[\p{L}\p{N}']+/gu) || []).length;
      const sent = (v.match(/[^.!?]+[.!?]+/g) || []).length;
      const stats = [['Words', words], ['Characters', v.length], ['No spaces', v.replace(/\s/g, '').length], ['Sentences', sent], ['Reading time', Math.max(words ? 1 : 0, Math.round(words / 220)) + ' min']];
      s.innerHTML = stats.map(([k, x]) => `<div class="stat"><b>${x}</b><span class="muted">${k}</span></div>`).join('');
    };
    t.oninput = upd; upd();
  }
});

TOOLS.push({
  id: 'case-converter', group: 'Text & Dev', icon: '🅰️', name: 'Case Converter',
  desc: 'Switch text between UPPER, lower, Title, camelCase, snake_case and more.',
  render(b) {
    const words = s => s.match(/[\p{L}\p{N}]+/gu) || [];
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const conv = {
      'UPPER CASE': s => s.toUpperCase(),
      'lower case': s => s.toLowerCase(),
      'Title Case': s => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, c) => a + c.toUpperCase()),
      'Sentence case': s => s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, c) => a + c.toUpperCase()),
      'camelCase': s => words(s).map((w, i) => i ? cap(w.toLowerCase()) : w.toLowerCase()).join(''),
      'PascalCase': s => words(s).map(w => cap(w.toLowerCase())).join(''),
      'snake_case': s => words(s).map(w => w.toLowerCase()).join('_'),
      'kebab-case': s => words(s).map(w => w.toLowerCase()).join('-')
    };
    b.innerHTML = `<textarea id="t" placeholder="Type or paste text…"></textarea><div class="btns" id="bt"></div>`;
    const t = b.querySelector('#t');
    Object.entries(conv).forEach(([k, fn]) => {
      const btn = document.createElement('button');
      btn.textContent = k;
      btn.onclick = () => { t.value = fn(t.value); };
      b.querySelector('#bt').appendChild(btn);
    });
  }
});

TOOLS.push({
  id: 'json-formatter', group: 'Text & Dev', icon: '{ }', name: 'JSON Formatter & Validator',
  desc: 'Pretty-print, minify and validate JSON.',
  render(b) {
    b.innerHTML = `<textarea id="t" placeholder='{"paste":"json here"}'></textarea>
      <div class="btns"><button id="pp" class="primary">Format</button><button id="mn">Minify</button><button id="cp">Copy</button></div><span id="st" class="status"></span>`;
    const t = b.querySelector('#t'), st = b.querySelector('#st');
    const go = indent => {
      st.className = 'status';
      try { t.value = JSON.stringify(JSON.parse(t.value), null, indent); st.textContent = 'Valid JSON ✔'; st.classList.add('ok'); }
      catch (e) { st.textContent = 'Invalid JSON: ' + e.message; st.classList.add('err'); }
    };
    b.querySelector('#pp').onclick = () => go(2);
    b.querySelector('#mn').onclick = () => go(0);
    b.querySelector('#cp').onclick = () => navigator.clipboard.writeText(t.value);
  }
});

TOOLS.push({
  id: 'base64', group: 'Text & Dev', icon: '🔐', name: 'Base64 Encode / Decode',
  desc: 'Convert text to Base64 and back, or turn a file (such as an image) into a Base64 data URL.',
  render(b) {
    b.innerHTML = `<textarea id="t" placeholder="Text or Base64…"></textarea>
      <div class="btns"><button id="enc" class="primary">Encode</button><button id="dec">Decode</button></div><span id="st" class="status"></span>
      <h3>File to Base64 data URL</h3><div id="dz"></div><textarea id="fo" placeholder="Data URL appears here…"></textarea>`;
    const t = b.querySelector('#t'), st = b.querySelector('#st'), fo = b.querySelector('#fo');
    b.querySelector('#enc').onclick = () => {
      const bytes = new TextEncoder().encode(t.value);
      let bin = ''; bytes.forEach(x => bin += String.fromCharCode(x));
      t.value = btoa(bin); st.textContent = '';
    };
    b.querySelector('#dec').onclick = () => {
      st.className = 'status';
      try {
        const bin = atob(t.value.trim());
        t.value = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
        st.textContent = '';
      } catch (e) { st.textContent = 'Not valid Base64.'; st.classList.add('err'); }
    };
    const dz = fileDrop({
      label: 'Choose any file', onChange: fs => {
        if (!fs.length) return;
        const r = new FileReader();
        r.onload = () => fo.value = r.result;
        r.readAsDataURL(fs[0]);
      }
    });
    b.querySelector('#dz').appendChild(dz.el);
  }
});

TOOLS.push({
  id: 'password-generator', group: 'Text & Dev', icon: '🔑', name: 'Password Generator',
  desc: 'Create strong random passwords using your browser\'s secure random generator.',
  render(b) {
    b.innerHTML = `<div class="grid">
        <label>Length: <b id="lv">16</b><input id="len" type="range" min="8" max="64" value="16"></label>
        <div>
          <label class="row"><input type="checkbox" id="up" checked> Uppercase</label>
          <label class="row"><input type="checkbox" id="lo" checked> Lowercase</label>
          <label class="row"><input type="checkbox" id="di" checked> Digits</label>
          <label class="row"><input type="checkbox" id="sy" checked> Symbols</label>
        </div></div>
      <button id="go" class="primary">Generate</button> <button id="cp">Copy</button>
      <p class="mono" id="pw" style="font-size:18px"></p>`;
    const len = b.querySelector('#len');
    len.oninput = () => b.querySelector('#lv').textContent = len.value;
    const randInt = n => {
      const lim = Math.floor(2 ** 32 / n) * n, a = new Uint32Array(1);
      do { crypto.getRandomValues(a); } while (a[0] >= lim);
      return a[0] % n;
    };
    b.querySelector('#go').onclick = () => {
      let set = '';
      if (b.querySelector('#up').checked) set += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (b.querySelector('#lo').checked) set += 'abcdefghijklmnopqrstuvwxyz';
      if (b.querySelector('#di').checked) set += '0123456789';
      if (b.querySelector('#sy').checked) set += '!@#$%^&*()-_=+[]{};:,.?';
      if (!set) { b.querySelector('#pw').textContent = 'Select at least one option.'; return; }
      let p = '';
      for (let i = 0; i < +len.value; i++) p += set[randInt(set.length)];
      b.querySelector('#pw').textContent = p;
    };
    b.querySelector('#cp').onclick = () => navigator.clipboard.writeText(b.querySelector('#pw').textContent);
    b.querySelector('#go').click();
  }
});

TOOLS.push({
  id: 'qr-code', group: 'Text & Dev', icon: '▦', name: 'QR Code Generator',
  desc: 'Make a QR code for a link or any text and download it as PNG.',
  render(b) {
    b.innerHTML = `<div class="grid">
        <label>Text or URL<input id="t" type="text" value="https://example.com"></label>
        <label>Size (px)<input id="sz" type="number" value="256" min="128" max="1024" step="16"></label>
      </div>
      <button id="go" class="primary">Generate</button> <button id="dl">Download PNG</button><br>
      <div class="qrbox" id="box"></div><p class="muted" id="st"></p>`;
    const box = b.querySelector('#box');
    const gen = () => {
      need(window.QRCode, 'QRCode library');
      box.innerHTML = '';
      const size = Math.min(1024, Math.max(128, +b.querySelector('#sz').value || 256));
      new QRCode(box, { text: b.querySelector('#t').value || ' ', width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    };
    b.querySelector('#go').onclick = () => { try { gen(); } catch (e) { b.querySelector('#st').textContent = e.message; } };
    b.querySelector('#dl').onclick = () => {
      const c = box.querySelector('canvas');
      if (c) c.toBlob(bl => saveAs(bl, 'qrcode.png'));
    };
    try { gen(); } catch (e) { b.querySelector('#st').textContent = e.message; }
  }
});

TOOLS.push({
  id: 'hash', group: 'Text & Dev', icon: '#️⃣', name: 'Hash Generator (SHA)',
  desc: 'Get SHA-1 / SHA-256 / SHA-384 / SHA-512 hashes of text or a file – handy for checking downloads.',
  render(b) {
    b.innerHTML = `<textarea id="t" placeholder="Type text to hash…" style="min-height:90px"></textarea>
      <p class="muted">…or hash a file:</p><div id="dz"></div><div id="res"></div>`;
    const res = b.querySelector('#res');
    const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
    async function show(data) {
      res.innerHTML = '';
      for (const alg of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) {
        const row = document.createElement('div');
        row.className = 'result';
        row.innerHTML = `<div class="rinfo"><b>${alg}</b><div class="mono"></div></div>`;
        row.querySelector('.mono').textContent = hex(await crypto.subtle.digest(alg, data));
        res.appendChild(row);
      }
    }
    const t = b.querySelector('#t');
    t.oninput = () => show(new TextEncoder().encode(t.value));
    const dz = fileDrop({ label: 'Choose a file', onChange: async fs => { if (fs.length) show(await fs[0].arrayBuffer()); } });
    b.querySelector('#dz').appendChild(dz.el);
    t.oninput();
  }
});

/* PRODUCTIVITY (data is saved in this browser's localStorage) ------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('toolbox:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('toolbox:' + k, JSON.stringify(v)); } catch (e) { alert('Could not save – browser storage may be full or blocked.'); } }
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayStr = (off = 0) => { const d = new Date(); d.setDate(d.getDate() + off); return ymd(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
const nf = n => String(Number(Number(n).toFixed(1)));
const rupee = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
let cleanups = [];
const onLeave = fn => cleanups.push(fn);

TOOLS.push({
  id: 'todo', group: 'Productivity', icon: '✅', name: 'To-Do List',
  desc: 'Tasks with priority and due dates. Saved in this browser.',
  render(b) {
    let items = store.get('todos', []), filter = 'all';
    const PRI = { high: 0, med: 1, low: 2 };
    b.innerHTML = `<div class="grid">
        <label>Task<input id="tx" type="text" placeholder="e.g. Finish SQL practice set"></label>
        <label>Priority<select id="pr"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></label>
        <label>Due date<input id="du" type="date"></label></div>
      <button id="add" class="primary">Add task</button>
      <div class="btns" id="tabs"><button data-f="all">All</button><button data-f="active">Active</button><button data-f="done">Done</button><button id="clr">Clear done</button></div>
      <p class="muted" id="sum"></p><ul class="list" id="ul"></ul>`;
    const ul = b.querySelector('#ul'), tx = b.querySelector('#tx');
    const save = () => { store.set('todos', items); draw(); };
    function draw() {
      const today = dayStr(0);
      const list = items.filter(i => filter === 'all' || (filter === 'active' ? !i.done : i.done))
        .sort((a, c) => (a.done - c.done) || (PRI[a.pri] - PRI[c.pri]) || (a.due || '9999').localeCompare(c.due || '9999'));
      ul.innerHTML = list.map(i => `<li data-id="${i.id}" class="${i.done ? 'done' : ''}">
          <input type="checkbox" data-act="toggle" ${i.done ? 'checked' : ''}>
          <span class="fn">${esc(i.text)}</span>
          <span class="tag ${i.pri}">${i.pri === 'med' ? 'medium' : i.pri}</span>
          ${i.due ? `<span class="muted ${!i.done && i.due < today ? 'late' : ''}">${esc(i.due)}</span>` : ''}
          <button class="mini" data-act="del" aria-label="Delete">✕</button></li>`).join('') || '<li class="muted">Nothing here yet.</li>';
      b.querySelector('#sum').textContent = `${items.filter(i => i.done).length} of ${items.length} tasks done`;
      b.querySelectorAll('#tabs [data-f]').forEach(x => x.classList.toggle('on', x.dataset.f === filter));
    }
    function add() {
      const text = tx.value.trim();
      if (!text) return;
      items.push({ id: uid(), text, pri: b.querySelector('#pr').value, due: b.querySelector('#du').value, done: false });
      tx.value = ''; save();
    }
    b.querySelector('#add').onclick = add;
    tx.onkeydown = e => { if (e.key === 'Enter') add(); };
    b.querySelector('#tabs').onclick = e => { if (e.target.dataset.f) { filter = e.target.dataset.f; draw(); } };
    b.querySelector('#clr').onclick = () => { items = items.filter(i => !i.done); save(); };
    ul.onclick = e => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const it = items.find(i => i.id === li.dataset.id);
      if (e.target.dataset.act === 'toggle') { it.done = !it.done; save(); }
      else if (e.target.dataset.act === 'del') { items = items.filter(i => i !== it); save(); }
    };
    draw();
  }
});

TOOLS.push({
  id: 'goals', group: 'Productivity', icon: '🎯', name: 'Target Chaser',
  desc: 'Set a numeric target and a deadline. See your progress, the daily pace you need, and whether you are on track.',
  render(b) {
    let goals = store.get('goals', []);
    b.innerHTML = `<div class="grid">
        <label>Goal<input id="nm" type="text" placeholder="e.g. Apply to 100 jobs"></label>
        <label>Target<input id="tg" type="number" min="0" step="any" placeholder="100"></label>
        <label>Unit<input id="un" type="text" placeholder="applications"></label>
        <label>Already done<input id="cu" type="number" min="0" step="any" value="0"></label>
        <label>Deadline<input id="dl" type="date"></label></div>
      <button id="add" class="primary">Add target</button><span id="st" class="status"></span><div id="list"></div>`;
    const list = b.querySelector('#list'), st = b.querySelector('#st');
    const save = () => { store.set('goals', goals); draw(); };
    function draw() {
      const today = dayStr(0);
      list.innerHTML = goals.map(g => {
        const pct = Math.min(100, Math.round(g.current / g.target * 100));
        const left = daysBetween(today, g.deadline);
        const remaining = Math.max(0, g.target - g.current);
        const total = Math.max(1, daysBetween(g.created, g.deadline));
        const elapsed = Math.min(total, Math.max(0, daysBetween(g.created, today)));
        const expected = g.start + (g.target - g.start) * elapsed / total;
        let status;
        if (g.current >= g.target) status = '🎉 Achieved!';
        else if (left < 0) status = '⏰ Deadline passed';
        else status = g.current >= expected ? '✅ On track' : `⚠️ Behind by ${nf(expected - g.current)} ${esc(g.unit)}`;
        const pace = (left >= 0 && remaining > 0) ? `Need ${nf(remaining / Math.max(1, left))} ${esc(g.unit)}/day · ${left} day(s) left` : '';
        return `<div class="goal" data-id="${g.id}">
          <div class="ghead"><b>${esc(g.name)}</b><button class="mini" data-act="del" aria-label="Delete">✕</button></div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div class="muted">${nf(g.current)} / ${nf(g.target)} ${esc(g.unit)} · ${pct}% · deadline ${esc(g.deadline)}</div>
          <div>${status}${pace ? ' · ' + pace : ''}</div>
          <div class="btns"><input type="number" step="any" class="inc" placeholder="Progress" style="max-width:140px">
            <button data-act="add">+ Add</button><button data-act="set">Set total</button></div></div>`;
      }).join('') || '<p class="muted">No targets yet. Add your first one above.</p>';
    }
    b.querySelector('#add').onclick = () => {
      st.className = 'status err';
      const name = b.querySelector('#nm').value.trim(), target = parseFloat(b.querySelector('#tg').value);
      const cur = parseFloat(b.querySelector('#cu').value) || 0, dl = b.querySelector('#dl').value;
      if (!name) { st.textContent = 'Give your goal a name.'; return; }
      if (!(target > 0)) { st.textContent = 'Target must be greater than 0.'; return; }
      if (!dl || dl < dayStr(0)) { st.textContent = 'Pick a deadline that is today or later.'; return; }
      goals.push({ id: uid(), name, target, unit: b.querySelector('#un').value.trim(), current: cur, start: cur, created: dayStr(0), deadline: dl });
      st.textContent = '';
      ['#nm', '#tg', '#un'].forEach(s => b.querySelector(s).value = '');
      save();
    };
    list.onclick = e => {
      const card = e.target.closest('.goal');
      if (!card || !e.target.dataset.act) return;
      const g = goals.find(x => x.id === card.dataset.id);
      const v = parseFloat(card.querySelector('.inc').value);
      if (e.target.dataset.act === 'del') { if (confirm('Delete this target?')) { goals = goals.filter(x => x !== g); save(); } }
      else if (Number.isFinite(v)) {
        g.current = e.target.dataset.act === 'add' ? Math.max(0, g.current + v) : Math.max(0, v);
        save();
      }
    };
    draw();
  }
});

TOOLS.push({
  id: 'habits', group: 'Productivity', icon: '🔥', name: 'Habit Tracker',
  desc: 'Tick off habits each day and build streaks. Tap any of the last 7 days to edit it.',
  render(b) {
    let habits = store.get('habits', []);
    b.innerHTML = `<div class="grid"><label>New habit<input id="nm" type="text" placeholder="e.g. 1 hour of coding"></label></div>
      <button id="add" class="primary">Add habit</button><div id="list" style="margin-top:12px"></div>`;
    const list = b.querySelector('#list'), nm = b.querySelector('#nm');
    const save = () => { store.set('habits', habits); draw(); };
    const streak = h => { let off = h.log[dayStr(0)] ? 0 : -1, n = 0; while (h.log[dayStr(off)]) { n++; off--; } return n; };
    function draw() {
      list.innerHTML = habits.map(h => {
        const days = [-6, -5, -4, -3, -2, -1, 0].map(o => {
          const ds = dayStr(o), letter = 'SMTWTFS'[new Date(ds + 'T00:00:00').getDay()];
          return `<button class="day ${h.log[ds] ? 'on' : ''}" data-act="day" data-d="${ds}" title="${ds}">${letter}</button>`;
        }).join('');
        return `<div class="result" data-id="${h.id}"><div class="rinfo"><div class="fn">${esc(h.name)}</div>
          <div class="muted">🔥 ${streak(h)} day streak · ${Object.keys(h.log).length} total</div></div>
          <div class="days">${days}</div><button class="mini" data-act="del" aria-label="Delete">✕</button></div>`;
      }).join('') || '<p class="muted">No habits yet.</p>';
    }
    const add = () => { const n = nm.value.trim(); if (!n) return; habits.push({ id: uid(), name: n, log: {} }); nm.value = ''; save(); };
    b.querySelector('#add').onclick = add;
    nm.onkeydown = e => { if (e.key === 'Enter') add(); };
    list.onclick = e => {
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const h = habits.find(x => x.id === row.dataset.id);
      if (e.target.dataset.act === 'day') { const d = e.target.dataset.d; if (h.log[d]) delete h.log[d]; else h.log[d] = 1; save(); }
      else if (e.target.dataset.act === 'del' && confirm('Delete this habit and its history?')) { habits = habits.filter(x => x !== h); save(); }
    };
    draw();
  }
});

TOOLS.push({
  id: 'pomodoro', group: 'Productivity', icon: '⏱️', name: 'Pomodoro Focus Timer',
  desc: 'Work in focused sprints with short breaks. A beep tells you when time is up.',
  render(b) {
    const modes = { focus: 25, short: 5, long: 15 };
    let mode = 'focus', iv = null, endAt = 0;
    let pomo = store.get('pomo', { date: dayStr(0), count: 0 });
    if (pomo.date !== dayStr(0)) pomo = { date: dayStr(0), count: 0 };
    b.innerHTML = `<div class="btns" id="modes"><button data-m="focus">Focus</button><button data-m="short">Short break</button><button data-m="long">Long break</button></div>
      <div class="timer" id="tm">25:00</div>
      <div class="btns"><button id="go" class="primary">Start</button><button id="rs">Reset</button></div>
      <div class="grid"><label>Focus length (minutes)<input id="fm" type="number" min="1" max="120" value="25"></label></div>
      <p class="muted" id="cnt"></p><p id="msg"></p>`;
    const tm = b.querySelector('#tm'), go = b.querySelector('#go'), fm = b.querySelector('#fm');
    const len = () => Math.min(120, Math.max(1, mode === 'focus' ? (+fm.value || 25) : modes[mode])) * 60;
    let remaining = len();
    const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    function beep() {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination); o.frequency.value = 880;
        g.gain.setValueAtTime(0.2, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1);
        o.start(); o.stop(ac.currentTime + 1);
      } catch (e) { /* sound is optional */ }
    }
    function show() {
      tm.textContent = fmt(remaining);
      go.textContent = iv ? 'Pause' : 'Start';
      b.querySelector('#cnt').textContent = `Focus sessions completed today: ${pomo.count}`;
      b.querySelectorAll('#modes [data-m]').forEach(x => x.classList.toggle('on', x.dataset.m === mode));
    }
    function stop() { clearInterval(iv); iv = null; }
    function tick() {
      remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      document.title = fmt(remaining) + ' – ' + (mode === 'focus' ? 'Focus' : 'Break');
      if (remaining <= 0) {
        stop(); beep();
        if (mode === 'focus') { pomo.count++; store.set('pomo', pomo); }
        b.querySelector('#msg').textContent = mode === 'focus' ? '🎉 Session done! Take a short break.' : '⏰ Break over – back to work!';
        remaining = len();
      }
      show();
    }
    go.onclick = () => {
      if (iv) { stop(); show(); return; }
      b.querySelector('#msg').textContent = '';
      endAt = Date.now() + remaining * 1000;
      iv = setInterval(tick, 250);
      show();
    };
    b.querySelector('#rs').onclick = () => { stop(); remaining = len(); b.querySelector('#msg').textContent = ''; show(); };
    b.querySelector('#modes').onclick = e => { if (e.target.dataset.m) { stop(); mode = e.target.dataset.m; remaining = len(); b.querySelector('#msg').textContent = ''; show(); } };
    fm.onchange = () => { if (!iv && mode === 'focus') { remaining = len(); show(); } };
    onLeave(stop);
    show();
  }
});

TOOLS.push({
  id: 'notes', group: 'Productivity', icon: '🗒️', name: 'Quick Notes',
  desc: 'Sticky notes that save automatically as you type.',
  render(b) {
    let notes = store.get('notes', []);
    b.innerHTML = `<button id="add" class="primary">+ New note</button><div class="cards" id="list" style="margin-top:12px"></div>`;
    const list = b.querySelector('#list');
    function draw() {
      list.innerHTML = notes.map(n => `<div class="card" data-id="${n.id}">
        <textarea placeholder="Write something…">${esc(n.text)}</textarea><button class="mini" data-act="del">Delete</button></div>`).join('')
        || '<p class="muted">No notes yet.</p>';
    }
    b.querySelector('#add').onclick = () => {
      notes.unshift({ id: uid(), text: '' });
      store.set('notes', notes); draw();
      const t = list.querySelector('textarea'); if (t) t.focus();
    };
    list.oninput = e => {
      const card = e.target.closest('[data-id]');
      if (!card || e.target.tagName !== 'TEXTAREA') return;
      notes.find(n => n.id === card.dataset.id).text = e.target.value;
      store.set('notes', notes);
    };
    list.onclick = e => {
      if (e.target.dataset.act !== 'del') return;
      const id = e.target.closest('[data-id]').dataset.id;
      if (confirm('Delete this note?')) { notes = notes.filter(n => n.id !== id); store.set('notes', notes); draw(); }
    };
    draw();
  }
});

TOOLS.push({
  id: 'jobs', group: 'Productivity', icon: '💼', name: 'Job Application Tracker',
  desc: 'Keep track of every application, its status, expected package and link. Export to CSV anytime.',
  render(b) {
    const STATUSES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'];
    let jobs = store.get('jobs', []);
    b.innerHTML = `<div class="grid">
        <label>Company<input id="co" type="text"></label>
        <label>Role<input id="ro" type="text" placeholder="Data Analyst"></label>
        <label>Status<select id="stt">${STATUSES.map(s => `<option>${s}</option>`).join('')}</select></label>
        <label>Date<input id="dt" type="date" value="${dayStr(0)}"></label>
        <label>Package (LPA, optional)<input id="lp" type="number" min="0" step="any"></label>
        <label>Job link (optional)<input id="lk" type="text" placeholder="https://…"></label></div>
      <button id="add" class="primary">Add application</button> <button id="csv">Download CSV</button>
      <span id="st" class="status"></span><div class="stats" id="stats"></div><div id="list" style="margin-top:12px"></div>`;
    const list = b.querySelector('#list'), st = b.querySelector('#st');
    const save = () => { store.set('jobs', jobs); draw(); };
    function draw() {
      b.querySelector('#stats').innerHTML = STATUSES.map(s => `<div class="stat"><b>${jobs.filter(j => j.status === s).length}</b><span class="muted">${s}</span></div>`).join('');
      list.innerHTML = [...jobs].sort((a, c) => (c.date || '').localeCompare(a.date || '')).map(j => `<div class="result" data-id="${j.id}">
        <div class="rinfo"><div><b>${esc(j.company)}</b> – ${esc(j.role)}</div>
        <div class="muted">${esc(j.date || '')}${j.lpa ? ' · ' + nf(j.lpa) + ' LPA' : ''}${/^https?:\/\//i.test(j.link) ? ` · <a href="${esc(j.link)}" target="_blank" rel="noopener">link</a>` : ''}</div></div>
        <select data-act="status" style="width:auto">${STATUSES.map(s => `<option ${s === j.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button class="mini" data-act="del" aria-label="Delete">✕</button></div>`).join('') || '<p class="muted">No applications yet.</p>';
    }
    b.querySelector('#add').onclick = () => {
      const company = b.querySelector('#co').value.trim(), role = b.querySelector('#ro').value.trim();
      if (!company || !role) { st.className = 'status err'; st.textContent = 'Company and role are required.'; return; }
      st.textContent = '';
      jobs.push({ id: uid(), company, role, status: b.querySelector('#stt').value, date: b.querySelector('#dt').value, lpa: parseFloat(b.querySelector('#lp').value) || 0, link: b.querySelector('#lk').value.trim() });
      ['#co', '#ro', '#lp', '#lk'].forEach(s => b.querySelector(s).value = '');
      save();
    };
    list.onchange = e => {
      if (e.target.dataset.act !== 'status') return;
      jobs.find(j => j.id === e.target.closest('[data-id]').dataset.id).status = e.target.value; save();
    };
    list.onclick = e => {
      if (e.target.dataset.act !== 'del') return;
      if (confirm('Delete this application?')) { const id = e.target.closest('[data-id]').dataset.id; jobs = jobs.filter(j => j.id !== id); save(); }
    };
    b.querySelector('#csv').onclick = () => {
      const q = v => { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
      const rows = [['Company', 'Role', 'Status', 'Date', 'LPA', 'Link'], ...jobs.map(j => [j.company, j.role, j.status, j.date, j.lpa || '', j.link])];
      saveAs(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }), 'job-applications.csv');
    };
    draw();
  }
});

TOOLS.push({
  id: 'expenses', group: 'Productivity', icon: '💰', name: 'Expense Tracker',
  desc: 'Log income and spending, see monthly totals and where your money goes (₹).',
  render(b) {
    const CATS = ['Food', 'Travel', 'Rent & Bills', 'Shopping', 'Study', 'Entertainment', 'Other'];
    let entries = store.get('expenses', []);
    b.innerHTML = `<div class="grid">
        <label>Type<select id="ty"><option value="expense">Expense</option><option value="income">Income</option></select></label>
        <label>Amount (₹)<input id="am" type="number" min="0" step="any"></label>
        <label>Description<input id="ds" type="text" placeholder="e.g. Lunch"></label>
        <label>Category<select id="ct">${CATS.map(c => `<option>${c}</option>`).join('')}</select></label>
        <label>Date<input id="dt" type="date" value="${dayStr(0)}"></label></div>
      <button id="add" class="primary">Add entry</button><span id="st" class="status"></span>
      <div class="grid"><label>Month<input id="mo" type="month" value="${dayStr(0).slice(0, 7)}"></label></div>
      <div class="stats" id="stats"></div><div id="cats" style="margin-top:12px"></div><ul class="list" id="ul"></ul>`;
    const ul = b.querySelector('#ul'), mo = b.querySelector('#mo'), st = b.querySelector('#st');
    const save = () => { store.set('expenses', entries); draw(); };
    const sum = a => a.reduce((s, e) => s + e.amount, 0);
    function draw() {
      const list = entries.filter(e => e.date.startsWith(mo.value)).sort((a, c) => c.date.localeCompare(a.date));
      const inc = sum(list.filter(e => e.type === 'income')), out = list.filter(e => e.type === 'expense'), exp = sum(out);
      b.querySelector('#stats').innerHTML = [['Income', inc], ['Spent', exp], ['Balance', inc - exp]]
        .map(([k, v]) => `<div class="stat"><b>${v < 0 ? '-' : ''}${rupee(Math.abs(v))}</b><span class="muted">${k}</span></div>`).join('');
      const byCat = {};
      out.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amount);
      b.querySelector('#cats').innerHTML = Object.entries(byCat).sort((a, c) => c[1] - a[1]).map(([c, v]) =>
        `<div class="muted">${esc(c)} · ${rupee(v)}</div><div class="bar"><i style="width:${Math.round(v / exp * 100)}%"></i></div>`).join('');
      ul.innerHTML = list.map(e => `<li data-id="${e.id}"><span class="muted">${esc(e.date)}</span>
        <span class="fn">${esc(e.desc || e.cat)} <span class="muted">(${esc(e.cat)})</span></span>
        <b class="${e.type === 'income' ? 'pos' : 'late'}">${e.type === 'income' ? '+' : '-'}${rupee(e.amount)}</b>
        <button class="mini" data-act="del" aria-label="Delete">✕</button></li>`).join('') || '<li class="muted">No entries this month.</li>';
    }
    b.querySelector('#add').onclick = () => {
      const amount = parseFloat(b.querySelector('#am').value);
      st.className = 'status err';
      if (!(amount > 0)) { st.textContent = 'Enter an amount greater than 0.'; return; }
      st.textContent = '';
      entries.push({ id: uid(), type: b.querySelector('#ty').value, amount, desc: b.querySelector('#ds').value.trim(), cat: b.querySelector('#ct').value, date: b.querySelector('#dt').value || dayStr(0) });
      b.querySelector('#am').value = ''; b.querySelector('#ds').value = '';
      save();
    };
    mo.onchange = draw;
    ul.onclick = e => {
      if (e.target.dataset.act !== 'del') return;
      const id = e.target.closest('li').dataset.id; entries = entries.filter(x => x.id !== id); save();
    };
    draw();
  }
});

TOOLS.push({
  id: 'emi', group: 'Productivity', icon: '🏦', name: 'EMI / Loan Calculator',
  desc: 'Work out the monthly EMI, total interest and total payment for any loan.',
  render(b) {
    b.innerHTML = `<div class="grid">
        <label>Loan amount (₹)<input id="p" type="number" min="0" value="500000"></label>
        <label>Interest rate (% per year)<input id="r" type="number" min="0" step="any" value="10"></label>
        <label>Tenure (years)<input id="y" type="number" min="0" step="any" value="3"></label></div><div class="stats" id="res"></div><div id="bar"></div>`;
    function calc() {
      const P = +b.querySelector('#p').value, R = +b.querySelector('#r').value / 12 / 100, N = Math.round(+b.querySelector('#y').value * 12);
      const res = b.querySelector('#res');
      if (!(P > 0 && N > 0 && R >= 0)) { res.innerHTML = ''; b.querySelector('#bar').innerHTML = ''; return; }
      const emi = R === 0 ? P / N : P * R * Math.pow(1 + R, N) / (Math.pow(1 + R, N) - 1);
      const total = emi * N, interest = total - P;
      res.innerHTML = [['Monthly EMI', emi], ['Total interest', interest], ['Total payment', total]]
        .map(([k, v]) => `<div class="stat"><b>${rupee(v)}</b><span class="muted">${k}</span></div>`).join('');
      b.querySelector('#bar').innerHTML = `<p class="muted">Interest is ${Math.round(interest / total * 100)}% of what you pay in total.</p>
        <div class="bar"><i style="width:${Math.round(interest / total * 100)}%"></i></div>`;
    }
    b.querySelectorAll('input').forEach(i => i.oninput = calc);
    calc();
  }
});

TOOLS.push({
  id: 'backup', group: 'Productivity', icon: '💾', name: 'Backup & Restore',
  desc: 'Your to-dos, goals and other data live only in this browser. Download a backup, or restore it on another device.',
  render(b) {
    b.innerHTML = `<div class="btns"><button id="exp" class="primary">Download backup (.json)</button></div>
      <h3>Restore from a backup</h3><div id="dz"></div>
      <div class="btns"><button id="imp">Restore</button><button id="wipe">Erase all ToolBox data</button></div><span id="st" class="status"></span>`;
    const st = b.querySelector('#st');
    const msg = (t, bad) => { st.className = 'status ' + (bad ? 'err' : 'ok'); st.textContent = t; };
    const mine = () => Object.keys(localStorage).filter(k => k.startsWith('toolbox:'));
    b.querySelector('#exp').onclick = () => {
      const data = {};
      mine().forEach(k => data[k] = localStorage.getItem(k));
      saveAs(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'toolbox-backup-' + dayStr(0) + '.json');
      msg('Backup downloaded ✔');
    };
    const dz = fileDrop({ accept: 'application/json,.json', label: 'Choose a backup file' });
    b.querySelector('#dz').appendChild(dz.el);
    b.querySelector('#imp').onclick = async () => {
      if (!dz.files.length) return msg('Choose a backup file first.', true);
      try {
        const data = JSON.parse(await dz.files[0].text());
        const keys = Object.keys(data).filter(k => k.startsWith('toolbox:') && typeof data[k] === 'string');
        if (!keys.length) throw new Error('No ToolBox data found in this file.');
        if (!confirm(`Restore ${keys.length} item(s)? This overwrites matching data in this browser.`)) return;
        keys.forEach(k => localStorage.setItem(k, data[k]));
        msg('Restored ✔ Reload the page to see everything.');
      } catch (e) { msg(e.message, true); }
    };
    b.querySelector('#wipe').onclick = () => {
      if (confirm('Erase ALL to-dos, goals, habits, notes, jobs and expenses from this browser? This cannot be undone.')) {
        mine().forEach(k => localStorage.removeItem(k)); msg('All ToolBox data erased.');
      }
    };
  }
});

/* ---------- app shell ---------- */
const GROUPS = ['Productivity', 'PDF', 'Image', 'Text & Dev'];
const nav = document.getElementById('nav');
const main = document.getElementById('main');
const search = document.getElementById('search');

function buildNav(filter = '') {
  nav.innerHTML = '';
  const f = filter.trim().toLowerCase();
  GROUPS.forEach(g => {
    const items = TOOLS.filter(t => t.group === g && (!f || (t.name + ' ' + t.desc).toLowerCase().includes(f)));
    if (!items.length) return;
    const h = document.createElement('h4'); h.textContent = g; nav.appendChild(h);
    items.forEach(t => {
      const a = document.createElement('a');
      a.href = '#/' + t.id; a.dataset.id = t.id; a.textContent = t.icon + '  ' + t.name;
      nav.appendChild(a);
    });
  });
  markActive();
}
function markActive() {
  const id = location.hash.replace(/^#\//, '');
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
}
function home() {
  document.title = 'ToolBox – Free PDF, Image & Text Tools';
  main.innerHTML = '<h2>Welcome 👋</h2><p class="muted">Pick a tool. All processing happens on your device – nothing is uploaded.</p>';
  const todos = store.get('todos', []), goals = store.get('goals', []), jobs = store.get('jobs', []);
  if (todos.length || goals.length || jobs.length) {
    const s = document.createElement('div');
    s.className = 'stats';
    s.innerHTML = [
      ['Open tasks', todos.filter(t => !t.done).length],
      ['Active targets', goals.filter(g => g.current < g.target).length],
      ['Applications sent', jobs.filter(j => j.status !== 'Wishlist').length]
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span class="muted">${k}</span></div>`).join('');
    main.appendChild(s);
  }
  GROUPS.forEach(g => {
    const h = document.createElement('h3'); h.textContent = g; main.appendChild(h);
    const wrap = document.createElement('div'); wrap.className = 'cards';
    TOOLS.filter(t => t.group === g).forEach(t => {
      const a = document.createElement('a'); a.className = 'card'; a.href = '#/' + t.id;
      a.innerHTML = '<b></b><span class="muted"></span>';
      a.querySelector('b').textContent = t.icon + ' ' + t.name;
      a.querySelector('span').textContent = t.desc;
      wrap.appendChild(a);
    });
    main.appendChild(wrap);
  });
}
function route() {
  cleanups.forEach(f => f());
  cleanups = [];
  const id = location.hash.replace(/^#\//, '');
  const t = TOOLS.find(x => x.id === id);
  markActive();
  nav.classList.remove('open');
  if (!t) return home();
  document.title = t.name + ' – ToolBox';
  main.innerHTML = '<h2></h2><p class="muted"></p><div id="body"></div>';
  main.querySelector('h2').textContent = t.icon + ' ' + t.name;
  main.querySelector('p').textContent = t.desc;
  t.render(main.querySelector('#body'));
  window.scrollTo(0, 0);
}
search.oninput = () => buildNav(search.value);
document.getElementById('menuBtn').onclick = () => nav.classList.toggle('open');
window.addEventListener('hashchange', route);
buildNav();
route();
