// Animated glass shards background (adapted from web/ambient.js) and scroll reveal.
document.documentElement.classList.add('js');

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

function ambient(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const shards = [[.72, .24, .76, -.25], [.12, .56, .62, 1.8], [.83, .83, .65, 3.3], [.27, .05, .48, .6], [.45, 1.08, .52, -1.1]];
  let last = 0, phase = 0, page = 0;
  const polygon = (pts, fill, stroke) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };
  function draw(t) {
    requestAnimationFrame(draw);
    if (document.hidden) return;
    if (last && t - last < 33) return;
    const dt = last ? Math.min(t - last, 100) : 0; last = t;
    if (!reduced.matches) phase += dt * .00014;
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const target = scrollY / Math.max(innerHeight, 1);
    page += (target - page) * .08;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const size = Math.min(w, h) * .95;
    shards.forEach(([cx, cy, scale, angle], i) => {
      const turn = angle + phase * (i % 2 ? -.28 : .3) + page * .13, tilt = .78 + Math.sin(phase + i + page * .18) * .15;
      const centerX = w * cx + Math.sin(phase + i) * size * .035, centerY = h * cy + Math.cos(phase * .7 + i) * size * .035;
      const pts = [[-.62, -.4], [.65, -.25], [-.19, .8]].map(([x, y]) => {
        x *= size * scale; y *= size * scale;
        return [centerX + x * Math.cos(turn) - y * Math.sin(turn) * tilt, centerY + x * Math.sin(turn) + y * Math.cos(turn) * tilt];
      });
      const tint = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      tint.addColorStop(0, 'rgba(65,89,116,.55)'); tint.addColorStop(.42, 'rgba(24,42,61,.22)');
      tint.addColorStop(.7, 'rgba(59,42,88,.43)'); tint.addColorStop(1, 'rgba(27,73,78,.58)');
      polygon(pts.map(([x, y]) => [x + 5, y + 7]), 'rgba(10,21,34,.65)', 'rgba(77,111,132,.22)');
      polygon(pts, tint, 'rgba(127,156,180,.45)');
      const [a, b, c] = pts, facet = [a[0] + (b[0] - a[0]) * .13 + (c[0] - a[0]) * .09, a[1] + (b[1] - a[1]) * .13 + (c[1] - a[1]) * .09];
      polygon([a, b, facet], 'rgba(114,149,167,.13)'); polygon([a, facet, c], 'rgba(71,119,138,.10)');
    });
  }
  requestAnimationFrame(draw);
}

const canvas = document.getElementById('ambient');
if (canvas) ambient(canvas);

const items = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !reduced.matches) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  items.forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });
} else {
  items.forEach((el) => el.classList.add('in'));
}
