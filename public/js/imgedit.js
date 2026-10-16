/* PP Queen "Crop & Edit" window.
   PPImageEditor.open(fileOrUrl) -> Promise<Blob | null>
   Crop (drag to move), zoom, rotate, flip, brightness, contrast.
   "Apply Crop" resolves with a JPEG blob; Cancel resolves with null. No libraries needed. */
(function () {
  var STAGE = 420;            // on-screen stage size (CSS px)
  var MAX_OUT = 1200;         // longest side of the saved image (px)
  var RATIOS = { '1:1': 1, '4:5': 4 / 5, '3:4': 3 / 4, '4:3': 4 / 3, '16:9': 16 / 9 };

  function loadImage(src) {
    return new Promise(function (ok, bad) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { bad(new Error('Could not open this image.')); };
      img.src = src;
    });
  }

  function open(source) {
    return new Promise(function (resolve) {
      var url = typeof source === 'string' ? source : URL.createObjectURL(source);
      var made = typeof source !== 'string';
      loadImage(url).then(function (img) { build(img); }, function (e) {
        if (made) URL.revokeObjectURL(url);
        alert(e.message); resolve(null);
      });

      function build(img) {
        var st = { ratio: '1:1', zoom: 1, rot90: 0, fine: 0, fx: 1, fy: 1, bright: 100, contrast: 100, ox: 0, oy: 0 };
        var bg = document.createElement('div');
        bg.className = 'modal-bg pp-crop-bg';
        bg.innerHTML =
          '<div class="modal pp-crop" role="dialog" aria-modal="true" aria-labelledby="pp-crop-title" data-no-translate>' +
          '<h2 id="pp-crop-title">Crop &amp; Edit</h2>' +
          '<div class="pp-crop-stage-wrap"><canvas class="pp-crop-stage" width="' + STAGE + '" height="' + STAGE + '"></canvas></div>' +
          '<p class="pp-crop-hint">Drag the image to move it. Use the sliders to zoom, rotate and adjust.</p>' +
          '<div class="pp-crop-grid">' +
          '<label>Shape<select data-k="ratio">' + Object.keys(RATIOS).map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('') + '</select></label>' +
          '<label>Zoom<input type="range" data-k="zoom" min="0.5" max="4" step="0.01" value="1"></label>' +
          '<label>Rotate<input type="range" data-k="fine" min="-45" max="45" step="1" value="0"></label>' +
          '<label>Brightness<input type="range" data-k="bright" min="50" max="150" step="1" value="100"></label>' +
          '<label>Contrast<input type="range" data-k="contrast" min="50" max="150" step="1" value="100"></label>' +
          '</div>' +
          '<div class="pp-crop-tools">' +
          '<button type="button" class="btn small ghost" data-a="left" title="Rotate left">⟲ 90°</button>' +
          '<button type="button" class="btn small ghost" data-a="right" title="Rotate right">⟳ 90°</button>' +
          '<button type="button" class="btn small ghost" data-a="fh" title="Flip left-right">⇋ Flip</button>' +
          '<button type="button" class="btn small ghost" data-a="fv" title="Flip up-down">⇵ Flip</button>' +
          '<button type="button" class="btn small ghost" data-a="reset">Reset</button>' +
          '</div>' +
          '<div class="row pp-crop-actions"><button type="button" class="btn" data-a="apply">Apply Crop</button>' +
          '<button type="button" class="btn ghost" data-a="cancel">Cancel</button></div></div>';
        document.body.appendChild(bg);

        var cv = bg.querySelector('canvas'), ctx = cv.getContext('2d');
        var hasFilter = 'filter' in ctx;

        function frame() {            // crop frame, centred on the stage
          var r = RATIOS[st.ratio], pad = 18, max = STAGE - pad * 2, w, h;
          if (r >= 1) { w = max; h = max / r; } else { h = max; w = max * r; }
          return { x: (STAGE - w) / 2, y: (STAGE - h) / 2, w: w, h: h };
        }
        function baseScale(f) {       // "cover" scale for the current rotation
          var rad = (st.rot90 * 90 + st.fine) * Math.PI / 180;
          var c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
          var bw = img.naturalWidth * c + img.naturalHeight * s;
          var bh = img.naturalWidth * s + img.naturalHeight * c;
          return Math.max(f.w / bw, f.h / bh);
        }
        function adjust(c, w, h) {    // brightness/contrast fallback (no ctx.filter, e.g. Safari)
          var b = st.bright / 100, k = st.contrast / 100;
          if (b === 1 && k === 1) return;
          var d = c.getImageData(0, 0, w, h), a = d.data;
          for (var i = 0; i < a.length; i += 4) for (var j = 0; j < 3; j++) {
            var v = a[i + j] * b; v = (v - 128) * k + 128; a[i + j] = v < 0 ? 0 : v > 255 ? 255 : v;
          }
          c.putImageData(d, 0, 0);
        }
        function paint(c, W, H, f, scaleK) {   // draw the edited image so that frame f fills W x H
          c.save();
          c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
          if (hasFilter) c.filter = 'brightness(' + st.bright + '%) contrast(' + st.contrast + '%)';
          var s = baseScale(f) * st.zoom * scaleK;
          c.translate(W / 2 + st.ox * scaleK, H / 2 + st.oy * scaleK);
          c.rotate((st.rot90 * 90 + st.fine) * Math.PI / 180);
          c.scale(st.fx * s, st.fy * s);
          c.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          c.restore();
          if (!hasFilter) adjust(c, W, H);
        }
        function draw() {
          var f = frame();
          ctx.clearRect(0, 0, STAGE, STAGE);
          ctx.fillStyle = '#2b2226'; ctx.fillRect(0, 0, STAGE, STAGE);
          // edited image, drawn relative to the stage centre
          var tmp = document.createElement('canvas'); tmp.width = STAGE; tmp.height = STAGE;
          var t = tmp.getContext('2d');
          t.fillStyle = '#fff'; t.fillRect(f.x, f.y, f.w, f.h);
          if (hasFilter) t.filter = 'brightness(' + st.bright + '%) contrast(' + st.contrast + '%)';
          t.save();
          t.translate(STAGE / 2 + st.ox, STAGE / 2 + st.oy);
          t.rotate((st.rot90 * 90 + st.fine) * Math.PI / 180);
          var s = baseScale(f) * st.zoom;
          t.scale(st.fx * s, st.fy * s);
          t.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          t.restore();
          if (!hasFilter) adjust(t, STAGE, STAGE);
          ctx.drawImage(tmp, 0, 0);
          // dim everything outside the crop frame
          ctx.fillStyle = 'rgba(20,10,15,.58)';
          ctx.fillRect(0, 0, STAGE, f.y);
          ctx.fillRect(0, f.y + f.h, STAGE, STAGE - f.y - f.h);
          ctx.fillRect(0, f.y, f.x, f.h);
          ctx.fillRect(f.x + f.w, f.y, STAGE - f.x - f.w, f.h);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(f.x, f.y, f.w, f.h);
          ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.beginPath();
          for (var i = 1; i < 3; i++) {
            ctx.moveTo(f.x + f.w * i / 3, f.y); ctx.lineTo(f.x + f.w * i / 3, f.y + f.h);
            ctx.moveTo(f.x, f.y + f.h * i / 3); ctx.lineTo(f.x + f.w, f.y + f.h * i / 3);
          }
          ctx.stroke();
        }

        // drag to move
        var drag = null;
        cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; cv.setPointerCapture(e.pointerId); });
        cv.addEventListener('pointermove', function (e) {
          if (!drag) return;
          var k = STAGE / cv.getBoundingClientRect().width;
          st.ox = drag.ox + (e.clientX - drag.x) * k; st.oy = drag.oy + (e.clientY - drag.y) * k; draw();
        });
        function endDrag() { drag = null; }
        cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
        cv.addEventListener('wheel', function (e) {
          e.preventDefault();
          st.zoom = Math.min(4, Math.max(0.5, st.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
          bg.querySelector('[data-k=zoom]').value = st.zoom; draw();
        }, { passive: false });

        bg.querySelectorAll('[data-k]').forEach(function (el) {
          el.addEventListener('input', function () {
            var k = el.dataset.k; st[k] = k === 'ratio' ? el.value : Number(el.value); draw();
          });
        });

        function setControls() {
          ['ratio', 'zoom', 'fine', 'bright', 'contrast'].forEach(function (k) { bg.querySelector('[data-k=' + k + ']').value = st[k]; });
        }
        function done(blob) {
          document.removeEventListener('keydown', onKey);
          bg.remove(); if (made) URL.revokeObjectURL(url); resolve(blob);
        }
        function onKey(e) { if (e.key === 'Escape') done(null); }
        document.addEventListener('keydown', onKey);

        bg.addEventListener('click', function (e) {
          var b = e.target.closest('[data-a]'); if (!b) return;
          var a = b.dataset.a;
          if (a === 'left') st.rot90 -= 1;
          else if (a === 'right') st.rot90 += 1;
          else if (a === 'fh') st.fx *= -1;
          else if (a === 'fv') st.fy *= -1;
          else if (a === 'reset') { st = { ratio: st.ratio, zoom: 1, rot90: 0, fine: 0, fx: 1, fy: 1, bright: 100, contrast: 100, ox: 0, oy: 0 }; setControls(); }
          else if (a === 'cancel') return done(null);
          else if (a === 'apply') {
            var f = frame(), r = RATIOS[st.ratio];
            var W = r >= 1 ? MAX_OUT : Math.round(MAX_OUT * r), H = r >= 1 ? Math.round(MAX_OUT / r) : MAX_OUT;
            var out = document.createElement('canvas'); out.width = W; out.height = H;
            paint(out.getContext('2d'), W, H, f, W / f.w);
            return out.toBlob(function (blob) { done(blob); }, 'image/jpeg', 0.9);
          }
          draw();
        });
        draw();
        bg.querySelector('[data-a=apply]').focus();
      }
    });
  }

  window.PPImageEditor = { open: open };
})();
