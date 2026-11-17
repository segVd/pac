const $ = id => document.getElementById(id);
const out = $('out');
const ctx = out.getContext('2d');
const src = $('src');
const srcCtx = src.getContext('2d');
let img = null;

const mode = () => document.querySelector('input[name="mode"]:checked').value;

$('file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    img = new Image();
    img.onload = () => {
        // Reset the area selection for each new image
        $('z').value = 1;
        $('x').value = 50;
        $('y').value = 50;
        render();
    };
    img.src = URL.createObjectURL(f);
});

['g', 'k', 's', 'c', 'grid', 'z', 'x', 'y'].forEach(id =>
$(id).addEventListener('input', render)
);
document.querySelectorAll('input[name="mode"]').forEach(r =>
r.addEventListener('change', render)
);

function rng(seed) {
    return () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
}

function dist(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
}

function nearest(p, cents) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < cents.length; i++) {
        const d = dist(p, cents[i]);
        if (d < bd) { bd = d; best = i; }
    }
    return best;
}

function kmeans(px, k) {
    const rand = rng(7);
    const cents = [px[Math.floor(rand() * px.length)].slice()];

    // k means++ initialisation
    while (cents.length < k) {
        const d = px.map(p => Math.min(...cents.map(c => dist(p, c))));
        const sum = d.reduce((a, b) => a + b, 0);
        let r = rand() * sum, i = 0;
        for (; i < d.length - 1; i++) {
            r -= d[i];
            if (r <= 0) break;
        }
        cents.push(px[i].slice());
    }

    const assign = new Array(px.length).fill(0);
    for (let iter = 0; iter < 12; iter++) {
        for (let i = 0; i < px.length; i++) assign[i] = nearest(px[i], cents);
        const sums = cents.map(() => [0, 0, 0, 0]);
        for (let i = 0; i < px.length; i++) {
            const s = sums[assign[i]];
            s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; s[3]++;
        }
        sums.forEach((s, i) => {
            if (s[3]) cents[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
        });
    }
    for (let i = 0; i < px.length; i++) assign[i] = nearest(px[i], cents);
    return { cents: cents.map(c => c.map(Math.round)), assign };
}

const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

// The region of the source image to convert, in source pixels
function getCrop() {
    if (mode() === 'whole') {
        return { sx: 0, sy: 0, sw: img.width, sh: img.height };
    }
    const zoom = parseFloat($('z').value);
    const side = Math.min(img.width, img.height) / zoom;
    const sx = (img.width - side) * (parseInt($('x').value, 10) / 100);
    const sy = (img.height - side) * (parseInt($('y').value, 10) / 100);
    return { sx, sy, sw: side, sh: side };
}

// Shows the whole image with the selected region highlighted
function drawSource(crop) {
    const w = 320;
    const h = Math.max(1, Math.round(w * img.height / img.width));
    const k = w / img.width;
    src.width = w;
    src.height = h;

    srcCtx.drawImage(img, 0, 0, w, h);
    srcCtx.fillStyle = 'rgba(13, 15, 20, 0.6)';
    srcCtx.fillRect(0, 0, w, h);
    srcCtx.drawImage(
        img, crop.sx, crop.sy, crop.sw, crop.sh,
        crop.sx * k, crop.sy * k, crop.sw * k, crop.sh * k
    );
    srcCtx.strokeStyle = '#7c9cff';
    srcCtx.lineWidth = 2;
    srcCtx.strokeRect(
        crop.sx * k + 1, crop.sy * k + 1,
        crop.sw * k - 2, crop.sh * k - 2
    );
}

function render() {
    const n = parseInt($('g').value, 10);
    const k = parseInt($('k').value, 10);
    const sat = parseFloat($('s').value);
    const cell = parseInt($('c').value, 10);
    $('gVal').textContent = n;
    $('kVal').textContent = k;
    $('sVal').textContent = sat;
    $('cVal').textContent = cell;
    $('zVal').textContent = parseFloat($('z').value).toFixed(1) + 'x';
    $('xVal').textContent = $('x').value;
    $('yVal').textContent = $('y').value;
    $('areaControls').hidden = mode() === 'whole';
    if (!img) return;

    const crop = getCrop();
    drawSource(crop);

    // Grid size applies to the longest side, the other side follows the aspect ratio
    const aspect = crop.sw / crop.sh;
    const cols = aspect >= 1 ? n : Math.max(1, Math.round(n * aspect));
    const rows = aspect >= 1 ? Math.max(1, Math.round(n / aspect)) : n;

    // Downscale the chosen region to cols x rows
    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    const sctx = small.getContext('2d');
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, cols, rows);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows);

    const data = sctx.getImageData(0, 0, cols, rows).data;
    const px = [];
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const adj = v => Math.max(0, Math.min(255, gray + (v - gray) * sat));
        px.push([adj(r), adj(g), adj(b)]);
    }

    const { cents, assign } = kmeans(px, Math.min(k, px.length));

    out.width = cols * cell;
    out.height = rows * cell;
    for (let i = 0; i < assign.length; i++) {
        ctx.fillStyle = hex(cents[assign[i]]);
        ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
    }

    if ($('grid').checked) {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= cols; i++) {
            const p = i * cell + 0.5;
            ctx.moveTo(p, 0); ctx.lineTo(p, out.height);
        }
        for (let j = 0; j <= rows; j++) {
            const p = j * cell + 0.5;
            ctx.moveTo(0, p); ctx.lineTo(out.width, p);
        }
        ctx.stroke();
    }

    // Palette legend with cell counts
    const counts = new Array(cents.length).fill(0);
    assign.forEach(a => counts[a]++);
    $('palette').innerHTML = cents.map((c, i) =>
    `<div class="sw"><div style="background:${hex(c)}"></div>${hex(c)}<br>${counts[i]} cells</div>`
    ).join('');
}

$('save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'pixel-pattern.png';
    a.href = out.toDataURL('image/png');
    a.click();
});
