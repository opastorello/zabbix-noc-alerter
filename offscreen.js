// Zabbix NOC Alerter - Offscreen audio
// Sons SINTETIZADOS via Web Audio, com cara de ALARME:
// osciladores detunados em camada + soft-clip (aspereza) + padroes repetidos (~2s).

let ctx;
function ac() {
  if (!ctx) ctx = new (self.AudioContext || self.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// curva de soft-clipping pra dar "liga"/aspereza de alarme
function makeShaper(c, amount = 0.35) {
  const ws = c.createWaveShaper();
  const n = 1024, curve = new Float32Array(n), k = amount * 100;
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  ws.curve = curve; ws.oversample = '2x';
  return ws;
}

// uma "voz" = 2 osciladores detunados -> envelope -> destino (mais encorpado que 1 so)
function voice(c, dest, o) {
  const { freq, start, dur, type = 'sawtooth', gain = 0.95, detune = 9, sweepTo = null, attack = 0.008, release = 0.05 } = o;
  const t0 = c.currentTime + start;
  const g = c.createGain();
  const peak = Math.max(0.02, gain);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(dest);
  [-detune, detune].forEach((dt) => {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.linearRampToValueAtTime(sweepTo, t0 + dur);
    osc.detune.setValueAtTime(dt, t0);
    osc.connect(g); osc.start(t0); osc.stop(t0 + dur + 0.02);
  });
}

const PRESETS = {
  // ahn-OO-ga repetido (buzina de submarino / alarme classico)
  klaxon(c, m) {
    let t = 0;
    for (let r = 0; r < 3; r++) {
      voice(c, m, { freq: 300, start: t, dur: 0.24, type: 'sawtooth', gain: 1 });
      voice(c, m, { freq: 460, start: t + 0.24, dur: 0.38, type: 'sawtooth', gain: 1 });
      t += 0.72;
    }
  },
  // sirene de emergencia: varredura sobe/desce, varios ciclos continuos
  siren(c, m) {
    let t = 0;
    for (let r = 0; r < 4; r++) {
      voice(c, m, { freq: 600, start: t, dur: 0.5, type: 'sawtooth', gain: 0.9, sweepTo: 1150, release: 0.02 });
      voice(c, m, { freq: 1150, start: t + 0.5, dur: 0.5, type: 'sawtooth', gain: 0.9, sweepTo: 600, release: 0.02 });
      t += 1.0;
    }
  },
  // warble rapido de duas notas (alarme de incendio / evacuacao)
  warble(c, m) {
    let t = 0, hi = false;
    while (t < 2.2) {
      voice(c, m, { freq: hi ? 1000 : 760, start: t, dur: 0.14, type: 'square', gain: 0.85, release: 0.02 });
      hi = !hi; t += 0.14;
    }
  },
  // whoop ascendente repetido (red alert)
  whoop(c, m) {
    let t = 0;
    for (let r = 0; r < 5; r++) {
      voice(c, m, { freq: 420, start: t, dur: 0.34, type: 'sawtooth', gain: 0.95, sweepTo: 1300, release: 0.02 });
      t += 0.42;
    }
  },
  // bip triplo de detector de fumaca, repetido
  pulse(c, m) {
    let t = 0;
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 3; i++) voice(c, m, { freq: 3100, start: t + i * 0.16, dur: 0.1, type: 'square', gain: 0.95, detune: 4 });
      t += 0.9;
    }
  },
  // buzz grave e aspero, sustentado com tremolo
  buzzer(c, m) {
    for (let r = 0; r < 3; r++) {
      voice(c, m, { freq: 165, start: r * 0.55, dur: 0.45, type: 'sawtooth', gain: 1, detune: 14, release: 0.03 });
    }
  },
  // mais brando (severidades menores), mas presente: tri-tom repetido
  chime(c, m) {
    let t = 0;
    for (let r = 0; r < 2; r++) {
      [880, 1175, 1480].forEach((f, i) => voice(c, m, { freq: f, start: t + i * 0.12, dur: 0.42, type: 'triangle', gain: 0.7, detune: 4 }));
      t += 0.9;
    }
  },
  // buzina de estadio: dois tons graves e asperos, sustentados
  airhorn(c, m) {
    for (let r = 0; r < 2; r++) {
      voice(c, m, { freq: 233, start: r * 1.0, dur: 0.85, type: 'sawtooth', gain: 1, detune: 16, release: 0.05 });
      voice(c, m, { freq: 311, start: r * 1.0, dur: 0.85, type: 'sawtooth', gain: 0.85, detune: 16, release: 0.05 });
    }
  },
  // sirene de ataque aereo / tornado: varredura longa sobe e desce
  airraid(c, m) {
    voice(c, m, { freq: 300, start: 0, dur: 1.3, type: 'sawtooth', gain: 0.95, detune: 10, sweepTo: 820, release: 0.05 });
    voice(c, m, { freq: 820, start: 1.3, dur: 1.4, type: 'sawtooth', gain: 0.95, detune: 10, sweepTo: 300, release: 0.05 });
  },
  // sino de incendio: badaladas metalicas rapidas
  bell(c, m) {
    let t = 0;
    while (t < 2.0) {
      voice(c, m, { freq: 1480, start: t, dur: 0.09, type: 'square', gain: 0.9, detune: 7, attack: 0.002, release: 0.07 });
      voice(c, m, { freq: 2240, start: t, dur: 0.06, type: 'square', gain: 0.45, detune: 7, attack: 0.002, release: 0.05 });
      t += 0.13;
    }
  },
  // alarme de incendio padrao T3 (3 bips + pausa, repetido)
  t3(c, m) {
    let t = 0;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 3; i++) voice(c, m, { freq: 520, start: t + i * 0.42, dur: 0.3, type: 'square', gain: 0.95, detune: 5 });
      t += 0.42 * 3 + 0.7;
    }
  },
  // despertador digital: grupos de bips rapidos e agudos
  digital(c, m) {
    let t = 0;
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 4; i++) voice(c, m, { freq: 2000, start: t + i * 0.09, dur: 0.06, type: 'square', gain: 0.85, detune: 3 });
      t += 0.5;
    }
  },
  // SOS em morse (... --- ...)
  sos(c, m) {
    const f = 850, d = 0.11, D = 0.33, g = 0.09, lg = 0.22;
    let t = 0;
    const beep = (dur) => { voice(c, m, { freq: f, start: t, dur, type: 'sine', gain: 0.95, detune: 2, attack: 0.004 }); t += dur + g; };
    beep(d); beep(d); beep(d); t += lg;
    beep(D); beep(D); beep(D); t += lg;
    beep(d); beep(d); beep(d);
  },
  // flatline de monitor hospitalar: tom continuo
  flatline(c, m) {
    voice(c, m, { freq: 1000, start: 0, dur: 1.9, type: 'sine', gain: 0.7, detune: 1, attack: 0.01, release: 0.12 });
  },
  // tom de alerta de emergencia (EAS): dois tons puros simultaneos (batimento aspero)
  eas(c, m) {
    voice(c, m, { freq: 853, start: 0, dur: 1.9, type: 'sine', gain: 0.55, detune: 0, attack: 0.01, release: 0.05 });
    voice(c, m, { freq: 960, start: 0, dur: 1.9, type: 'sine', gain: 0.55, detune: 0, attack: 0.01, release: 0.05 });
  },
  // "slow whoop" (alarme de incendio UK): varredura longa sobe e cai, repetida
  slowwhoop(c, m) {
    for (let r = 0; r < 2; r++) {
      voice(c, m, { freq: 500, start: r * 1.4, dur: 1.2, type: 'sawtooth', gain: 0.9, detune: 8, sweepTo: 1250, release: 0.1 });
    }
  },
  // telefone antigo: dois toques (ring-ring) com batimento 440/480
  oldphone(c, m) {
    [0, 0.55].forEach((s) => {
      voice(c, m, { freq: 440, start: s, dur: 0.4, type: 'sine', gain: 0.7, detune: 0 });
      voice(c, m, { freq: 480, start: s, dur: 0.4, type: 'sine', gain: 0.7, detune: 0 });
    });
  },
  // laser/sci-fi: zaps descendentes repetidos
  laser(c, m) {
    let t = 0;
    for (let r = 0; r < 5; r++) {
      voice(c, m, { freq: 1800, start: t, dur: 0.22, type: 'sawtooth', gain: 0.85, detune: 4, sweepTo: 300, release: 0.02 });
      t += 0.3;
    }
  },
  // alarme de carro: cicla yelp -> warble -> buzina
  caralarm(c, m) {
    let t = 0;
    for (let i = 0; i < 6; i++) { voice(c, m, { freq: 700, start: t, dur: 0.07, type: 'square', gain: 0.85, detune: 4, sweepTo: 1400 }); t += 0.08; }
    t += 0.1;
    for (let i = 0; i < 8; i++) { voice(c, m, { freq: i % 2 ? 1100 : 800, start: t, dur: 0.08, type: 'square', gain: 0.85 }); t += 0.08; }
    t += 0.1;
    voice(c, m, { freq: 520, start: t, dur: 0.5, type: 'sawtooth', gain: 0.9, detune: 8 });
  },
  // chirp de central de alarme: bips curtos e agudos espacados
  chirp(c, m) {
    let t = 0;
    for (let r = 0; r < 6; r++) { voice(c, m, { freq: 3000, start: t, dur: 0.05, type: 'square', gain: 0.8, detune: 2 }); t += 0.25; }
  },
  // buzina de submarino (dive): honks graves
  submarine(c, m) {
    for (let r = 0; r < 2; r++) {
      voice(c, m, { freq: 180, start: r * 0.9, dur: 0.7, type: 'sawtooth', gain: 1, detune: 12, release: 0.06 });
    }
  },
  // alerta vermelho (alternancia de duas notas)
  redalert(c, m) { let t = 0; for (let r = 0; r < 4; r++) { voice(c, m, { freq: 392, start: t, dur: 0.18, type: 'sawtooth', gain: 0.95 }); voice(c, m, { freq: 523, start: t + 0.18, dur: 0.18, type: 'sawtooth', gain: 0.95 }); t += 0.42; } },
  // drone grave de reator
  nuclear(c, m) { for (let r = 0; r < 3; r++) { voice(c, m, { freq: 110, start: r * 0.7, dur: 0.6, type: 'sawtooth', gain: 1, detune: 14 }); voice(c, m, { freq: 138, start: r * 0.7, dur: 0.6, type: 'sawtooth', gain: 0.6, detune: 14 }); } },
  // monitor cardiaco: bip ritmico
  ekg(c, m) { let t = 0; for (let r = 0; r < 6; r++) { voice(c, m, { freq: 1500, start: t, dur: 0.08, type: 'sine', gain: 0.8, detune: 2, attack: 0.003 }); t += 0.45; } },
  // rampa ascendente urgente
  ascending(c, m) { let t = 0; for (let r = 0; r < 5; r++) { voice(c, m, { freq: 400, start: t, dur: 0.3, type: 'sawtooth', gain: 0.9, detune: 6, sweepTo: 1600, release: 0.02 }); t += 0.36; } },
  // rampa descendente
  descending(c, m) { let t = 0; for (let r = 0; r < 5; r++) { voice(c, m, { freq: 1600, start: t, dur: 0.3, type: 'sawtooth', gain: 0.9, detune: 6, sweepTo: 400, release: 0.02 }); t += 0.36; } },
  // bip-bip duplo repetido
  beepbeep(c, m) { let t = 0; for (let r = 0; r < 4; r++) { voice(c, m, { freq: 1000, start: t, dur: 0.09, type: 'square', gain: 0.9 }); voice(c, m, { freq: 1000, start: t + 0.15, dur: 0.09, type: 'square', gain: 0.9 }); t += 0.5; } },
  // trinado metalico rapido
  trill(c, m) { let t = 0, hi = false; while (t < 2.0) { voice(c, m, { freq: hi ? 1500 : 1180, start: t, dur: 0.06, type: 'square', gain: 0.85, detune: 5 }); hi = !hi; t += 0.07; } },
  // woop unico longo
  woop(c, m) { voice(c, m, { freq: 380, start: 0, dur: 0.9, type: 'sawtooth', gain: 0.95, detune: 8, sweepTo: 1500, release: 0.05 }); voice(c, m, { freq: 1500, start: 0.9, dur: 0.5, type: 'sawtooth', gain: 0.7, detune: 8, sweepTo: 380, release: 0.05 }); },
  // phaser sci-fi
  phaser(c, m) { let t = 0; for (let r = 0; r < 4; r++) { voice(c, m, { freq: 1200, start: t, dur: 0.3, type: 'square', gain: 0.8, detune: 6, sweepTo: 200, release: 0.02 }); t += 0.34; } },
  // buzina de neblina (grave longa)
  foghorn(c, m) { voice(c, m, { freq: 110, start: 0, dur: 1.6, type: 'sawtooth', gain: 1, detune: 6, attack: 0.05, release: 0.2 }); },
  // apito de vapor (agudo sustentado)
  steamwhistle(c, m) { voice(c, m, { freq: 1568, start: 0, dur: 1.6, type: 'square', gain: 0.55, detune: 10, attack: 0.04, release: 0.15 }); voice(c, m, { freq: 2349, start: 0, dur: 1.6, type: 'square', gain: 0.25, detune: 10 }); },
  // gongo grave decaindo
  gong(c, m) { [82, 164, 246, 330].forEach((f, i) => voice(c, m, { freq: f, start: 0, dur: 1.8 - i * 0.2, type: 'sine', gain: 0.7 / (i + 1), detune: 2, attack: 0.004, release: 1.2 })); },
  // despertador de campainha (clatter rapido)
  alarmclock(c, m) { for (let r = 0; r < 2; r++) { const b = r * 0.9; for (let i = 0; i < 10; i++) voice(c, m, { freq: i % 2 ? 2100 : 1800, start: b + i * 0.04, dur: 0.035, type: 'square', gain: 0.8 }); } },
  // micro-ondas pronto (4 bips)
  microwave(c, m) { for (let i = 0; i < 4; i++) voice(c, m, { freq: 1000, start: i * 0.2, dur: 0.12, type: 'sine', gain: 0.8, detune: 2 }); },
  // re de caminhao (bip lento constante)
  truck(c, m) { for (let i = 0; i < 5; i++) voice(c, m, { freq: 1050, start: i * 0.5, dur: 0.3, type: 'square', gain: 0.85, detune: 2 }); },
  // buzzer industrial (pulsos asperos)
  industrial(c, m) { let t = 0; while (t < 2.0) { voice(c, m, { freq: 300, start: t, dur: 0.18, type: 'sawtooth', gain: 0.95, detune: 16 }); t += 0.28; } },
  // sonar (ping descendente)
  sonar(c, m) { let t = 0; for (let r = 0; r < 4; r++) { voice(c, m, { freq: 1200, start: t, dur: 0.5, type: 'sine', gain: 0.85, detune: 2, sweepTo: 600, attack: 0.003, release: 0.4 }); t += 0.6; } },
  // radar (ping curto repetido)
  radar(c, m) { let t = 0; for (let r = 0; r < 5; r++) { voice(c, m, { freq: 980, start: t, dur: 0.4, type: 'sine', gain: 0.7, detune: 1, attack: 0.002, release: 0.35 }); t += 0.45; } },
  // ding suave repetido (cinto/aviso leve)
  seatbelt(c, m) { for (let i = 0; i < 4; i++) voice(c, m, { freq: 1318, start: i * 0.4, dur: 0.25, type: 'triangle', gain: 0.6, detune: 2, attack: 0.005, release: 0.2 }); },
  // dois tons alternados (sirene europeia)
  twotone(c, m) { let t = 0; for (let r = 0; r < 4; r++) { voice(c, m, { freq: 660, start: t, dur: 0.35, type: 'square', gain: 0.9, detune: 4 }); voice(c, m, { freq: 880, start: t + 0.35, dur: 0.35, type: 'square', gain: 0.9, detune: 4 }); t += 0.7; } }
};

function play(preset, volume) {
  const c = ac();
  const master = c.createGain();
  master.gain.value = Math.max(0, Math.min(1, Number(volume)));
  const shaper = makeShaper(c, 0.35);
  const pre = c.createGain();
  pre.gain.value = 0.8;
  pre.connect(shaper); shaper.connect(master); master.connect(c.destination);
  (PRESETS[preset] || PRESETS.warble)(c, pre);
}

// timer de polling: o offscreen fica vivo (o service worker dorme) e "cutuca" o
// background a cada N ms -> permite checar em < 30s.
let pollTimer = null;
const MIN_POLL_MS = 5000; // piso do heartbeat (coerente com MIN_POLL_SEC=5 no background)
chrome.runtime.onMessage.addListener((m) => {
  if (!m || m.target !== 'offscreen') return;
  if (m.type === 'play') {
    play(m.preset, m.volume);
  } else if (m.type === 'setInterval') {
    if (pollTimer) clearInterval(pollTimer);
    const ms = Math.max(MIN_POLL_MS, Number(m.ms) || 15000);
    pollTimer = setInterval(() => { chrome.runtime.sendMessage({ action: 'tick' }).catch(() => {}); }, ms);
  }
});
