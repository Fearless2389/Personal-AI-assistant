import { useEffect, useRef } from 'react';

/**
 * Synapse — a living network of nodes that drift and link, brightening near the
 * cursor. The signature visual of Nexus. Purely decorative (aria-hidden), and it
 * respects prefers-reduced-motion.
 */
export function NeuralField({ className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    let w, h, pts, raf;
    const mouse = { x: -9999, y: -9999 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function size() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(120, Math.floor((w * h) / 12000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.32, vy: (Math.random() - 0.5) * 0.32
      }));
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const dm = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, dm < 160 ? 2.6 : 1.6, 0, Math.PI * 2);
        ctx.fillStyle = dm < 160 ? 'rgba(94,234,212,0.98)' : 'rgba(130,200,205,0.62)';
        ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 150) {
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const near = Math.hypot(mx - mouse.x, my - mouse.y);
            const hot = near < 180;
            ctx.strokeStyle = `rgba(45,212,191,${(1 - d / 150) * (hot ? 0.6 : 0.22)})`;
            ctx.lineWidth = hot ? 1.1 : 0.7;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(frame);
    }

    const onMove = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };

    size();
    window.addEventListener('resize', size);
    window.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    if (reduced) { frame(); cancelAnimationFrame(raf); } // draw one static frame
    else frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      window.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

export default NeuralField;
