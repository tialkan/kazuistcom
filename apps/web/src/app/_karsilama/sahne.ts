/**
 * Welcome scene engine (kazuist.com first screen and the launch countdown). Plain DOM work on a root the React
 * component renders; every loop and listener is torn down by the returned cleanup. Layers back to front: tint, sun,
 * clouds, mountain, Kazu, wordmark, sand grains, paper grain.
 */

const A = '/karsilama/';
const BULUT_SAYISI = 12;
const POZLAR = ['okuma', 'kirpma', 'okuma', 'dusunme', 'fikir', 'el', 'okuma', 'esneme', 'kutlama'];

// Hand drawn letters, no font: [advance, mode (n nonzero fill, e evenodd fill, s stroke 34), path, sink, tilt].
type Harf = [number, 'n' | 'e' | 's', string, number, number];
const HARFLER: Harf[] = [
  [118, 'n', 'M0 0H34V300H0Z M30 186L82 0H118L64 196Z M50 150L82 126L118 300H82Z', 20, -7],
  [122, 'e', 'M0 300L45 0H77L122 300H87L79 244H43L35 300Z M48 210H74L61 112Z', 38, 5],
  [114, 'n', 'M0 0H114V34L38 266H114V300H0V266L76 34H0Z', 24, -9],
  [118, 's', 'M17 0V226Q17 300 59 300Q101 300 101 226V0', 6, 0],
  [34, 's', 'M17 0V300', 50, 6],
  [
    118,
    's',
    'M101 64Q101 17 59 17Q17 17 17 76Q17 124 59 150Q101 176 101 228Q101 283 59 283Q17 283 17 238',
    26,
    0,
  ],
  [122, 's', 'M0 17H122M61 17V300', 42, -4],
];
const ARALIK = 24;

function harfCiz(g: CanvasRenderingContext2D, h: Harf) {
  g.lineWidth = 34;
  g.lineCap = 'butt';
  g.lineJoin = 'round';
  const p = new Path2D(h[2]);
  if (h[1] === 's') g.stroke(p);
  else g.fill(p, h[1] === 'e' ? 'evenodd' : 'nonzero');
}

/** KAZUIST logo with IST in sun yellow, as a data URL. */
export function logoUrl(olcek = 2): string {
  let ax = 0;
  const xs = HARFLER.map((h) => {
    const x = ax;
    ax += h[0] + ARALIK;
    return x;
  });
  const W = ax - ARALIK;
  const c = document.createElement('canvas');
  c.width = Math.ceil((W + 4) * olcek);
  c.height = Math.ceil(304 * olcek);
  const g = c.getContext('2d');
  if (!g) return '';
  g.scale(olcek, olcek);
  g.translate(2, 2);
  HARFLER.forEach((h, i) => {
    g.fillStyle = g.strokeStyle = i >= 4 ? '#FCD322' : '#fff';
    g.save();
    g.translate(xs[i] ?? 0, 0);
    harfCiz(g, h);
    g.restore();
  });
  return c.toDataURL();
}

export type SahneSecenek = { kelime: boolean; gunes: 'kaydir' | 'batis'; yazilar?: string[] };

export function sahneKur(k: HTMLElement, s: SahneSecenek): () => void {
  const $ = <T extends HTMLElement>(q: string) => k.querySelector(q) as T;
  const durdur: Array<() => void> = [];
  let acik = true;
  const raf = (f: (t: number) => void) => {
    const d = (t: number) => {
      if (!acik) return;
      f(t);
      requestAnimationFrame(d);
    };
    requestAnimationFrame(d);
  };
  const dinle = <K extends keyof WindowEventMap>(
    hedef: Window | HTMLElement,
    ad: K,
    f: (e: WindowEventMap[K]) => void,
    o?: AddEventListenerOptions,
  ) => {
    hedef.addEventListener(ad, f as EventListener, o);
    durdur.push(() => hedef.removeEventListener(ad, f as EventListener, o));
  };
  const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // sand grains: tiny and faint
  const cv = $<HTMLCanvasElement>('.kzw-kum');
  const cx = cv.getContext('2d');
  const rs = () => {
    cv.width = cv.clientWidth * devicePixelRatio;
    cv.height = cv.clientHeight * devicePixelRatio;
  };
  rs();
  dinle(window, 'resize', rs);
  const P = Array.from({ length: 110 }, () => ({
    x: Math.random(),
    y: Math.pow(Math.random(), 0.6),
    v: 0.0004 + Math.random() * 0.0012,
    r: 0.25 + Math.random() * 0.55,
    a: 0.06 + Math.random() * 0.16,
    ph: Math.random() * 6,
  }));
  if (cx && !azHareket)
    raf((t) => {
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const p of P) {
        p.x += p.v;
        if (p.x > 1.02) {
          p.x = -0.02;
          p.y = Math.pow(Math.random(), 0.6);
        }
        cx.fillStyle = `rgba(255,232,196,${p.a})`;
        cx.beginPath();
        cx.arc(
          p.x * cv.width,
          (p.y + Math.sin(t / 900 + p.ph) * 0.008) * cv.height,
          p.r * devicePixelRatio,
          0,
          7,
        );
        cx.fill();
      }
    });

  // sun rays: slow random wandering rotation, direction flips, gentle breathing; inner disc still
  const isin = $<HTMLImageElement>('.kzw-isin');
  let ang = 0;
  let vel = 0;
  let hedefHiz = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6);
  let sonraki = performance.now() + 6000 + Math.random() * 8000;
  if (!azHareket)
    raf((t) => {
      if (t > sonraki) {
        hedefHiz = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 7);
        sonraki = t + 6000 + Math.random() * 9000;
      }
      vel += (hedefHiz - vel) * 0.004;
      ang += vel / 60;
      isin.style.transform = `rotate(${ang}deg) scale(${1 + 0.035 * Math.sin(t / 2300) + 0.015 * Math.sin(t / 970)})`;
    });

  // clouds: never more than 3 on screen; pool cycles; bigger = faster
  const Lc = $('.kzw-l-cl');
  let nxt = Math.floor(Math.random() * BULUT_SAYISI);
  const canli = new Set<{ im: HTMLImageElement; x: number; sp: number }>();
  const zamanlayicilar = new Set<number>();
  const dogur = (ilk: boolean) => {
    if (!acik || canli.size >= 3) return;
    const h = 5 + Math.random() * 12;
    const im = document.createElement('img');
    im.src = `${A}bulut${(nxt++ % BULUT_SAYISI) + 1}.webp`;
    im.alt = '';
    im.decoding = 'async';
    im.style.cssText = `position:absolute;left:0;top:${6 + Math.random() * 40}vh;height:${h}vh;will-change:transform`;
    Lc.appendChild(im);
    canli.add({
      im,
      x: ilk ? Math.random() * innerWidth : -h * (innerHeight / 100) * 2.4,
      sp: innerWidth / (2600 / h) / 60,
    });
  };
  for (let i = 0; i < 3; i++) dogur(true);
  raf(() => {
    for (const o of [...canli]) {
      o.x += azHareket ? o.sp * 0.2 : o.sp;
      o.im.style.transform = `translateX(${o.x}px)`;
      if (o.x > innerWidth + 10) {
        o.im.remove();
        canli.delete(o);
        const id = window.setTimeout(
          () => {
            zamanlayicilar.delete(id);
            dogur(false);
          },
          1500 + Math.random() * 5000,
        );
        zamanlayicilar.add(id);
      }
    }
  });
  durdur.push(() => zamanlayicilar.forEach((id) => clearTimeout(id)));

  // Kazu: slow pose changes and a very small breathing
  const kz = $('.kzw-kazu');
  const pozImg = new Map<string, HTMLImageElement>();
  for (const n of new Set(POZLAR)) {
    const im = document.createElement('img');
    im.src = `${A}kazu-${n}.webp`;
    im.alt = '';
    im.className = 'kzw-poz';
    kz.appendChild(im);
    pozImg.set(n, im);
  }
  let pi = 0;
  pozImg.get(POZLAR[0] ?? 'okuma')?.classList.add('acik');
  const pozId = window.setInterval(() => {
    const a = pozImg.get(POZLAR[pi % POZLAR.length] ?? '');
    pi++;
    const b = pozImg.get(POZLAR[pi % POZLAR.length] ?? '');
    if (a && b && a !== b) {
      a.classList.remove('acik');
      b.classList.add('acik');
    }
  }, 11000);
  durdur.push(() => clearInterval(pozId));
  const t0 = performance.now();
  if (!azHareket)
    raf((t) => {
      const sn = (t - t0) / 1000;
      const sy = 1 + 0.01 * Math.sin(sn * 1.6);
      const sx = 1 - 0.005 * Math.sin(sn * 1.6);
      const r = 0.5 * Math.sin(sn * 0.5) + 0.2 * Math.sin(sn * 1.3);
      const y = -0.15 * Math.max(0, Math.sin(sn * 0.35)) ** 8;
      kz.style.transform = `translateX(-50%) translateY(${y}vh) rotate(${r.toFixed(2)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
    });

  // handwriting: the pen writes academic words; the first letters start fading before the word is finished
  const yz = k.querySelector<HTMLCanvasElement>('.kzw-yazi');
  const kalem = k.querySelector<HTMLImageElement>('.kzw-kalem');
  const yazilar = s.yazilar ?? [];
  const yg = yz?.getContext('2d');
  if (yz && kalem && yg && yazilar.length && !azHareket) {
    const yrs = () => {
      yz.width = yz.clientWidth * devicePixelRatio;
      yz.height = yz.clientHeight * devicePixelRatio;
    };
    yrs();
    dinle(window, 'resize', yrs);
    let wi = Math.floor(Math.random() * yazilar.length);
    let kelime = '';
    let px = 0;
    let py = 0;
    let gen = 0;
    let bas = 0;
    let hiz = 0;
    let bekle = 0;
    const yeni = (t: number) => {
      kelime = yazilar[wi++ % yazilar.length] ?? '';
      const fs = Math.min(yz.width / 7, yz.height * 0.6);
      yg.font = `500 ${fs}px KzEl, cursive`;
      gen = yg.measureText(kelime).width;
      px = (yz.width - gen) * (0.1 + Math.random() * 0.8);
      py = yz.height * (0.55 + Math.random() * 0.2);
      hiz = gen / (900 + kelime.length * 260);
      bas = t;
    };
    let hazir = false;
    void document.fonts.load('500 40px KzEl').finally(() => {
      hazir = true;
    });
    raf((t) => {
      if (!hazir) return;
      if (!kelime) yeni(t);
      const gecen = t - bas;
      const bas2 = gen * 0.45;
      const head = Math.min(gen, gecen * hiz);
      const tail = Math.max(0, (gecen * hiz - bas2) * 1.15);
      yg.clearRect(0, 0, yz.width, yz.height);
      yg.save();
      yg.beginPath();
      yg.rect(px - 4, 0, head + 8, yz.height);
      yg.clip();
      yg.fillStyle = 'rgba(255,248,236,.94)';
      yg.fillText(kelime, px, py);
      yg.restore();
      if (tail > 0) {
        const fx = px + tail;
        const gr = yg.createLinearGradient(fx - yz.width * 0.06, 0, fx, 0);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        yg.save();
        yg.globalCompositeOperation = 'destination-out';
        yg.fillStyle = 'rgba(0,0,0,1)';
        yg.fillRect(0, 0, Math.max(0, fx - yz.width * 0.06), yz.height);
        yg.fillStyle = gr;
        yg.fillRect(fx - yz.width * 0.06, 0, yz.width * 0.06, yz.height);
        yg.restore();
      }
      // pen nib follows the writing head with a small handwriting bob; it lifts away once the word is done
      const r = yz.getBoundingClientRect();
      const d = devicePixelRatio;
      const bitti = head >= gen;
      const kalk = bitti ? Math.min(1, (gecen - gen / hiz) / 700) : 0;
      const nx = r.left + (px + head) / d;
      const ny = r.top + py / d - 6 + Math.sin(t / 90) * 3 * (1 - kalk) - kalk * 40;
      kalem.style.opacity = String(1 - kalk);
      kalem.style.transform = `translate3d(${nx}px,${ny - kalem.offsetHeight}px,0)`;
      if (tail >= gen + yz.width * 0.06) {
        bekle = bekle || t;
        if (t - bekle > 900) {
          bekle = 0;
          kelime = '';
        }
      }
    });
  }

  // wordmark: letters sink into the sand at different, very slow speeds, some tilting
  if (s.kelime) {
    let ax = 0;
    const row = $('.kzw-kelime');
    const W = HARFLER.reduce((t, h) => t + h[0] + ARALIK, -ARALIK);
    row.style.aspectRatio = `${W}/300`;
    const L = HARFLER.map((h) => {
      const c = document.createElement('canvas');
      const S = 4;
      c.width = (h[0] + 4) * S;
      c.height = 304 * S;
      const g = c.getContext('2d');
      if (g) {
        g.scale(S, S);
        g.translate(2, 2);
        g.fillStyle = g.strokeStyle = '#fff';
        harfCiz(g, h);
        g.globalCompositeOperation = 'source-atop';
        g.strokeStyle = 'rgba(205,150,96,.32)';
        g.lineWidth = 1.2;
        for (let i = 0; i < 70; i++) {
          const y0 = -10 + i * 5.2;
          g.beginPath();
          g.moveTo(-30, y0);
          for (let xx = -30; xx < h[0] + 60; xx += 8)
            g.lineTo(xx, y0 + Math.sin((xx + ax) / 38 + i * 0.7) * 3.2 + Math.sin((xx + ax) / 91 + i) * 2.4);
          g.stroke();
        }
      }
      const im = document.createElement('img');
      im.src = c.toDataURL();
      im.alt = '';
      im.style.cssText = `position:absolute;left:${(ax / W) * 100}%;width:${((h[0] + 4) / W) * 100}%;top:0;transform-origin:50% 100%;will-change:transform`;
      row.appendChild(im);
      ax += h[0] + ARALIK;
      return {
        im,
        y: (h[3] / 300) * 100,
        tilt: h[4] * (0.8 + Math.random() * 0.5),
        sp: 100 / ((240 + Math.random() * 420) * 60),
      };
    });
    raf(() => {
      for (const l of L) {
        l.y = Math.min(105, l.y + l.sp);
        l.im.style.transform = `translateY(${l.y}%) rotate(${(l.tilt * Math.min(1, l.y / 100)).toFixed(2)}deg)`;
      }
    });
  }

  // depth: mouse; sun: half-circle orbit driven by scrolling, endless, long night between days
  let mx = 0;
  let my = 0;
  let cxs = 0;
  let cys = 0;
  let hedef = s.gunes === 'batis' ? 0.8 : 0.5;
  let cur = hedef;
  dinle(window, 'mousemove', (e) => {
    mx = e.clientX / innerWidth - 0.5;
    my = e.clientY / innerHeight - 0.5;
  });
  if (s.gunes === 'kaydir') {
    dinle(
      k,
      'wheel',
      (e) => {
        hedef += e.deltaY / 4200;
        e.preventDefault();
      },
      { passive: false },
    );
    let ty: number | null = null;
    dinle(
      k,
      'touchstart',
      (e) => {
        ty = e.touches[0]?.clientY ?? null;
      },
      { passive: true },
    );
    dinle(
      k,
      'touchmove',
      (e) => {
        const y = e.touches[0]?.clientY;
        if (ty == null || y == null) return;
        hedef += (ty - y) / 2100;
        ty = y;
      },
      { passive: true },
    );
  }
  const D = { sun: 6, cl: 12, dag: 22, kz: 30, wm: 38 };
  const lSun = $('.kzw-l-sun');
  const lCl = $('.kzw-l-cl');
  const lDag = $('.kzw-l-dag');
  const lKz = $('.kzw-l-kz');
  const lWm = $('.kzw-l-wm');
  const tint = $('.kzw-tint');
  raf(() => {
    cxs += (mx - cxs) * 0.06;
    cys += (my - cys) * 0.06;
    cur += (hedef - cur) * 0.06;
    const CY = 1.75;
    const uu = ((cur % CY) + CY) % CY;
    const pc = uu < 1 ? uu : 0;
    const th = Math.PI * pc;
    const vw = innerWidth / 100;
    const vh = innerHeight / 100;
    const sx = 50 * vw - 68 * vw * Math.cos(th);
    const sy = 70 * vh - 54 * vh * Math.sin(th);
    const sc = 0.4 + 0.6 * Math.sin(th);
    lSun.style.transform = `translate3d(${sx - 50 * vw - cxs * D.sun}px,${sy - 16.5 * vh - cys * D.sun}px,0) scale(${sc})`;
    lCl.style.transform = `translate3d(${-cxs * D.cl}px,${-cys * D.cl}px,0)`;
    lDag.style.transform = `translate3d(${-cxs * D.dag}px,${-cys * D.dag * 0.5}px,0)`;
    lKz.style.transform = `translate3d(${-cxs * D.kz}px,${-cys * D.kz * 0.5}px,0)`;
    lWm.style.transform = `translate3d(${-cxs * D.wm}px,0,0)`;
    tint.style.opacity = String((1 - Math.sin(th)) * 0.85);
  });

  return () => {
    acik = false;
    durdur.forEach((f) => f());
  };
}
