(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  SPACE SHOOTER — GALAXY ATTACK · HTML5 Edition
   *  Canvas 2D vertical shooter. Assets recovered from the original game.
   * ------------------------------------------------------------------ */

  const W = 540;
  const H = 960;
  const TAU = Math.PI * 2;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const $ = (id) => document.getElementById(id);

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  /* ------------------------------------------------------------------ *
   *  Assets
   * ------------------------------------------------------------------ */

  const IMG_SRC = {
    player: 'assets/img/player.png',
    player_alt: 'assets/img/player_alt.png',
    player_alt2: 'assets/img/player_alt2.png',
    enemy_1: 'assets/img/enemy_1.png',
    enemy_2: 'assets/img/enemy_2.png',
    enemy_3: 'assets/img/enemy_3.png',
    enemy_4: 'assets/img/enemy_4.png',
    enemy_5: 'assets/img/enemy_5.png',
    enemy_6: 'assets/img/enemy_6.png',
    enemy_7: 'assets/img/enemy_7.png',
    enemy_8: 'assets/img/enemy_8.png',
    boss_1: 'assets/img/boss_1.png',
    boss_2: 'assets/img/boss_2.png',
    boss_3: 'assets/img/boss_3.png',
    elite: 'assets/img/elite.png',
    nebula: 'assets/img/nebula.jpg'
  };

  const IMG = {};
  let loadedCount = 0;
  const imgKeys = Object.keys(IMG_SRC);

  function preloadImages(done) {
    let remaining = imgKeys.length;
    imgKeys.forEach((key) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (--remaining === 0) done();
      };
      img.onerror = () => {
        if (--remaining === 0) done();
      };
      img.src = IMG_SRC[key];
      IMG[key] = img;
    });
  }

  /* ------------------------------------------------------------------ *
   *  Audio
   * ------------------------------------------------------------------ */

  const SFX_SRC = {
    shoot: 'assets/audio/shoot.wav',
    explode: 'assets/audio/explode.wav',
    explode_small: 'assets/audio/explode_small.wav',
    laser: 'assets/audio/laser.wav',
    powerup: 'assets/audio/powerup.wav',
    coin: 'assets/audio/coin.wav',
    boss: 'assets/audio/boss.wav',
    warning: 'assets/audio/warning.wav',
    lose: 'assets/audio/lose.wav',
    win: 'assets/audio/win.wav'
  };

  const Sound = {
    ctx: null,
    gain: null,
    buffers: {},
    enabled: true,
    unlocked: false,
    music: null,
    musicEls: {},

    init() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.75;
        this.gain.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
      }

      Object.entries(SFX_SRC).forEach(([name, url]) => {
        fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((buf) => {
            if (!this.ctx) return;
            this.ctx.decodeAudioData(buf, (decoded) => {
              this.buffers[name] = decoded;
            }, () => {});
          })
          .catch(() => {});
      });

      ['menu', 'battle'].forEach((track) => {
        const el = new Audio(track === 'menu' ? 'assets/audio/bgm_menu.mp3' : 'assets/audio/bgm_battle.mp3');
        el.loop = true;
        el.preload = 'auto';
        el.volume = 0;
        this.musicEls[track] = el;
      });
    },

    unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      if (this.enabled) this.playMusic(currentTrack);
    },

    play(name, volume = 1, rate = 1) {
      if (!this.enabled || !this.ctx || !this.buffers[name]) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g);
      g.connect(this.gain);
      src.start(0);
    },

    playMusic(track) {
      if (!this.enabled) return;
      Object.entries(this.musicEls).forEach(([name, el]) => {
        if (name !== track) {
          el.pause();
          el.currentTime = 0;
        }
      });
      const el = this.musicEls[track];
      if (!el) return;
      this.music = track;
      el.volume = track === 'menu' ? 0.3 : 0.42;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    },

    stopMusic() {
      Object.values(this.musicEls).forEach((el) => el.pause());
    },

    setEnabled(on) {
      this.enabled = on;
      if (this.gain) this.gain.gain.value = on ? 0.75 : 0;
      if (!on) {
        this.stopMusic();
      } else if (this.unlocked) {
        this.playMusic(currentTrack);
      }
    }
  };

  let currentTrack = 'menu';

  /* ------------------------------------------------------------------ *
   *  Persistence
   * ------------------------------------------------------------------ */

  const Store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('ss2_' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('ss2_' + key, JSON.stringify(value));
      } catch (e) {}
    }
  };

  /* ------------------------------------------------------------------ *
   *  Ships
   * ------------------------------------------------------------------ */

  const SHIPS = [
    { id: 'player', name: 'INTERCEPTOR', img: 'player', desc: 'DENGELİ', speed: 1.0, fire: 1.0, dmg: 1.0 },
    { id: 'player_alt', name: 'LANCER', img: 'player_alt', desc: 'HIZLI · ÇEVİK', speed: 1.18, fire: 1.08, dmg: 0.92 },
    { id: 'player_alt2', name: 'FORTRESS', img: 'player_alt2', desc: 'GÜÇLÜ · AĞIR', speed: 0.86, fire: 0.9, dmg: 1.25 }
  ];

  const ZONES = [
    { name: 'NEBULA', color: 'rgba(90,130,255,0.16)' },
    { name: 'CRIMSON', color: 'rgba(255,60,120,0.15)' },
    { name: 'EMERALD', color: 'rgba(50,255,180,0.12)' },
    { name: 'AMBER', color: 'rgba(255,170,60,0.14)' },
    { name: 'VOID', color: 'rgba(160,90,255,0.17)' }
  ];

  function zoneIndex() {
    return Math.floor(Math.max(0, G.wave - 1) / 5) % ZONES.length;
  }

  /* ------------------------------------------------------------------ *
   *  Glow sprite cache
   * ------------------------------------------------------------------ */

  function glowSprite(color, size, inner = 0.15) {
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size, size, size * inner, size, size, size);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.22, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size * 2, size * 2);
    return c;
  }

  const FX = {
    cyan: glowSprite('rgba(70,230,255,0.9)', 32),
    cyanSoft: glowSprite('rgba(70,200,255,0.5)', 48),
    red: glowSprite('rgba(255,70,90,0.9)', 32),
    orange: glowSprite('rgba(255,150,60,0.9)', 32),
    pink: glowSprite('rgba(255,70,170,0.9)', 36),
    purple: glowSprite('rgba(170,110,255,0.9)', 36),
    gold: glowSprite('rgba(255,210,90,0.9)', 32),
    blue: glowSprite('rgba(120,150,255,0.9)', 32),
    white: glowSprite('rgba(255,255,255,0.9)', 32)
  };

  /* ------------------------------------------------------------------ *
   *  Game state
   * ------------------------------------------------------------------ */

  const G = {
    state: 'boot',
    time: 0,
    score: 0,
    wave: 0,
    streak: 0,
    streakTimer: 0,
    best: Store.get('best', 0),
    shipIndex: Store.get('ship', 0),
    lives: 3,
    bombs: 2,
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    pickups: [],
    particles: [],
    texts: [],
    stars: [],
    boss: null,
    spawnQueue: [],
    waveSpawning: false,
    waveClearTimer: 0,
    banner: null,
    shake: 0,
    flash: 0,
    bgOffset: 0,
    dragging: false,
    pointer: { x: W / 2, y: H - 170 },
    keys: {},
    fireCd: 0,
    mouseActive: false,
    overTimer: 0
  };

  /* ------------------------------------------------------------------ *
   *  Helpers
   * ------------------------------------------------------------------ */

  function makeStars() {
    G.stars = [];
    for (let i = 0; i < 140; i++) {
      const layer = i < 70 ? 0 : i < 110 ? 1 : 2;
      G.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: layer,
        r: layer === 0 ? rand(0.6, 1.1) : layer === 1 ? rand(1.0, 1.7) : rand(1.4, 2.3),
        s: [18, 46, 92][layer] * rand(0.8, 1.25),
        tw: Math.random() * TAU
      });
    }
  }

  function addParticles(x, y, n, color, speed = 220, size = 4, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(speed * 0.2, speed);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(life * 0.5, life),
        max: life,
        size: rand(size * 0.5, size),
        color
      });
    }
  }

  function addRing(x, y, color, r = 10, maxR = 90, life = 0.45, width = 3) {
    G.particles.push({ ring: true, x, y, r, maxR, life, max: life, color, width });
  }

  function addText(x, y, text, color = '#ffd76a', size = 16) {
    G.texts.push({ x, y, text, color, size, life: 0.9, max: 0.9 });
  }

  function maybeDrop(x, y, chance = 0.14, forced = null) {
    if (!forced && Math.random() > chance) return;
    const roll = Math.random();
    let type;
    if (forced) type = forced;
    else if (roll < 0.46) type = 'weapon';
    else if (roll < 0.68) type = 'shield';
    else if (roll < 0.83) type = 'bomb';
    else if (roll < 0.96) type = 'coin';
    else type = 'life';
    G.pickups.push({
      x, y,
      vx: rand(-14, 14),
      vy: rand(50, 80),
      type,
      t: 0,
      r: 20
    });
  }

  function updateHearts() {
    const el = $('hearts');
    let html = '';
    for (let i = 0; i < 3; i++) {
      const dead = i >= G.lives ? ' dead' : '';
      html += `<div class="heart${dead}"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.1C.8 8.3 3 4.6 6.6 4.6c2.2 0 3.6 1.2 4.4 2.4h2c.8-1.2 2.2-2.4 4.4-2.4 3.6 0 5.8 3.7 4.2 7.3C19.5 16.4 12 21 12 21z" fill="url(#hg)"/><defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8ccb"/><stop offset="1" stop-color="#ff1e86"/></linearGradient></defs></svg></div>`;
    }
    el.innerHTML = html;
  }

  const hudCache = { score: -1, wave: -1, bombs: -1, combo: -1 };

  function updateHud() {
    if (G.score !== hudCache.score) {
      hudCache.score = G.score;
      $('score').textContent = G.score.toLocaleString('tr-TR');
    }
    if (G.wave !== hudCache.wave) {
      hudCache.wave = G.wave;
      $('wave').textContent = G.wave;
    }
    if (G.bombs !== hudCache.bombs) {
      hudCache.bombs = G.bombs;
      $('bombCount').textContent = G.bombs;
      $('btnBomb').classList.toggle('empty', G.bombs <= 0);
    }
    const mult = comboMultiplier();
    if (mult !== hudCache.combo) {
      hudCache.combo = mult;
      const combo = $('combo');
      if (mult > 1) {
        combo.textContent = 'KOMBO ×' + mult;
        combo.classList.add('on');
      } else {
        combo.classList.remove('on');
      }
    }
  }

  function comboMultiplier() {
    return clamp(1 + Math.floor(G.streak / 6), 1, 5);
  }

  /* ------------------------------------------------------------------ *
   *  Player
   * ------------------------------------------------------------------ */

  function createPlayer() {
    const ship = SHIPS[G.shipIndex] || SHIPS[0];
    return {
      x: W / 2,
      y: H - 170,
      tx: W / 2,
      ty: H - 170,
      vx: 0,
      speed: 460 * ship.speed,
      ship,
      r: 13,
      shield: false,
      invuln: 0,
      weapon: 1,
      tilt: 0
    };
  }

  function playerFire(dt) {
    const p = G.player;
    G.fireCd -= dt;
    if (G.fireCd > 0) return;

    const rate = 0.15 / (p.ship.fire * (1 + (p.weapon - 1) * 0.06));
    G.fireCd = rate;

    const dmg = (0.9 + (p.weapon - 1) * 0.28) * p.ship.dmg;
    const shots = [];
    const lvl = p.weapon;

    if (lvl === 1) shots.push([0, -1, p.x, p.y - 22]);
    else if (lvl === 2) {
      shots.push([-0.02, -1, p.x - 9, p.y - 18], [0.02, -1, p.x + 9, p.y - 18]);
    } else if (lvl === 3) {
      shots.push([0, -1, p.x, p.y - 24], [-0.14, -1, p.x - 12, p.y - 14], [0.14, -1, p.x + 12, p.y - 14]);
    } else if (lvl === 4) {
      shots.push([0, -1, p.x, p.y - 26], [-0.1, -1, p.x - 10, p.y - 18], [0.1, -1, p.x + 10, p.y - 18], [-0.22, -1, p.x - 17, p.y - 8], [0.22, -1, p.x + 17, p.y - 8]);
    } else {
      shots.push([0, -1, p.x, p.y - 28], [-0.09, -1, p.x - 9, p.y - 22], [0.09, -1, p.x + 9, p.y - 22],
        [-0.2, -1, p.x - 18, p.y - 12], [0.2, -1, p.x + 18, p.y - 12], [-0.32, -1, p.x - 24, p.y - 2], [0.32, -1, p.x + 24, p.y - 2]);
    }

    shots.forEach(([dx, dy, x, y]) => {
      const len = Math.hypot(dx, dy);
      G.bullets.push({
        x, y,
        vx: (dx / len) * 820,
        vy: (dy / len) * 820,
        r: 5,
        dmg,
        t: 0
      });
    });

    Sound.play('shoot', 0.16, rand(0.95, 1.06));
    addRing(p.x, p.y - 26, 'rgba(80,220,255,0.5)', 4, 22, 0.16, 2);
  }

  function playerHit() {
    const p = G.player;
    if (p.invuln > 0) return;
    if (p.shield) {
      p.shield = false;
      p.invuln = 0.9;
      addRing(p.x, p.y, 'rgba(120,160,255,0.9)', 20, 110, 0.45, 4);
      addParticles(p.x, p.y, 18, 'rgba(120,170,255,0.9)', 260, 4, 0.5);
      Sound.play('explode_small', 0.6);
      G.shake = 8;
      return;
    }

    G.lives--;
    updateHearts();
    G.streak = 0;
    G.streakTimer = 0;
    p.invuln = 2.4;
    p.weapon = Math.max(1, p.weapon - 1);
    G.shake = 22;
    G.flash = 0.5;
    addParticles(p.x, p.y, 40, 'rgba(255,140,90,0.95)', 340, 6, 0.9);
    addRing(p.x, p.y, 'rgba(255,120,90,0.95)', 10, 160, 0.6, 5);
    Sound.play('explode', 0.8);

    // clear nearby bullets
    for (let i = G.enemyBullets.length - 1; i >= 0; i--) {
      const b = G.enemyBullets[i];
      if (Math.hypot(b.x - p.x, b.y - p.y) < 170) {
        addParticles(b.x, b.y, 2, 'rgba(255,160,120,0.8)', 80, 3, 0.3);
        G.enemyBullets.splice(i, 1);
      }
    }

    if (G.lives < 0) {
      G.lives = 0;
      updateHearts();
      gameOver();
    }
  }

  function useBomb() {
    if (G.state !== 'playing' || G.bombs <= 0) return;
    G.bombs--;
    updateHud();
    G.flash = 0.9;
    G.shake = 26;
    Sound.play('laser', 0.8, 0.7);

    addRing(G.player.x, G.player.y, 'rgba(120,220,255,0.95)', 20, 620, 0.8, 8);
    addRing(G.player.x, G.player.y, 'rgba(255,255,255,0.8)', 10, 420, 0.55, 4);

    G.enemyBullets.forEach((b) => addParticles(b.x, b.y, 2, 'rgba(120,220,255,0.9)', 100, 3, 0.5));
    G.enemyBullets = [];

    const bombTargets = G.enemies.slice();
    bombTargets.forEach((e) => {
      e.flash = 0.2;
      e.hp -= e.boss ? 60 : 5;
      if (e.hp <= 0) killEnemy(e);
    });
  }

  /* ------------------------------------------------------------------ *
   *  Enemies
   * ------------------------------------------------------------------ */

  const ENEMY_TYPES = [
    { key: 'enemy_1', hp: 2, r: 24, speed: 95, fire: 0, pattern: 'straight', score: 10, tilt: true },
    { key: 'enemy_2', hp: 3, r: 26, speed: 72, fire: 2.4, pattern: 'sine', score: 15 },
    { key: 'enemy_3', hp: 4, r: 27, speed: 64, fire: 2.0, pattern: 'sine', score: 20 },
    { key: 'enemy_4', hp: 5, r: 30, speed: 58, fire: 1.9, pattern: 'hover', score: 25 },
    { key: 'enemy_5', hp: 6, r: 30, speed: 52, fire: 1.7, pattern: 'sine', score: 30 },
    { key: 'enemy_6', hp: 4, r: 24, speed: 120, fire: 0, pattern: 'dive', score: 22 },
    { key: 'enemy_7', hp: 7, r: 32, speed: 48, fire: 1.5, pattern: 'hover', score: 35 },
    { key: 'enemy_8', hp: 9, r: 34, speed: 42, fire: 1.35, pattern: 'sine', score: 45 }
  ];

  function unlockedTypes() {
    const max = Math.min(ENEMY_TYPES.length, 1 + Math.floor((G.wave + 1) / 2));
    return ENEMY_TYPES.slice(0, max);
  }

  function spawnEnemy(type, x, y = -80, opts = {}) {
    const hpMul = 1 + (G.wave - 1) * 0.17;
    const spdMul = Math.min(1.55, 1 + (G.wave - 1) * 0.035);
    const fireMul = Math.max(0.55, 1 - (G.wave - 1) * 0.03);
    const img = IMG[type.key];
    const iw = img && img.width ? img.width : 140;
    const ih = img && img.height ? img.height : 120;
    const size = type.r * 2.25;

    G.enemies.push({
      x,
      y,
      baseX: x,
      img: type.key,
      w: size,
      h: size * (ih / iw),
      r: type.r,
      hp: Math.ceil(type.hp * hpMul),
      maxHp: Math.ceil(type.hp * hpMul),
      speed: type.speed * spdMul,
      fireRate: type.fire ? type.fire * fireMul : 0,
      fireCd: type.fire ? rand(0.6, type.fire) : 0,
      pattern: opts.pattern || type.pattern,
      vx: opts.vx || 0,
      score: type.score,
      phase: rand(0, TAU),
      t: 0,
      flash: 0,
      tilt: 0,
      boss: false
    });
  }

  function spawnBoss() {
    const idx = Math.floor(G.wave / 5) - 1;
    const key = ['boss_1', 'boss_2', 'boss_3'][idx % 3];
    const img = IMG[key];
    const iw = img && img.width ? img.width : 300;
    const ih = img && img.height ? img.height : 220;
    const size = 250;

    const hp = 130 + G.wave * 22;
    const boss = {
      x: W / 2,
      y: -160,
      img: key,
      w: size,
      h: size * (ih / iw),
      r: 86,
      hp,
      maxHp: hp,
      speed: 60,
      t: 0,
      flash: 0,
      entering: true,
      attackCd: 1.6,
      attackIndex: 0,
      spiral: 0,
      boss: true,
      score: 1200,
      phase2: false
    };
    G.enemies.push(boss);
    G.boss = boss;
    $('bossBar').classList.remove('hidden');
    $('bossFill').style.width = '100%';
    Sound.play('boss', 0.9);
    Sound.play('warning', 0.5);
    showBanner('⚠ BOSS GELDİ', 'HEDEFİ YOK ET', 2.2, '#ff5aa8');
  }

  function enemyShoot(e, aimed = true) {
    const p = G.player;
    const speed = 190 + G.wave * 6;
    let angle;
    if (aimed) {
      angle = Math.atan2(p.y - e.y, p.x - e.x);
    } else {
      angle = Math.PI / 2;
    }
    const spread = e.boss ? 0 : 0.12;
    const n = e.boss ? 1 : 1;
    for (let i = 0; i < n; i++) {
      G.enemyBullets.push({
        x: e.x,
        y: e.y + 10,
        vx: Math.cos(angle) * speed + rand(-spread, spread) * 60,
        vy: Math.sin(angle) * speed,
        r: 7,
        t: 0,
        color: e.boss ? 'pink' : 'red'
      });
    }
    Sound.play('laser', 0.1, rand(1.3, 1.5));
  }

  function bossAttack(boss) {
    const p = G.player;
    const phase = boss.phase2 ? 1.35 : 1;
    const mode = boss.attackIndex % 5;
    boss.attackIndex++;

    if (mode === 0) {
      // fan
      const base = Math.atan2(p.y - boss.y, p.x - boss.x);
      const count = boss.phase2 ? 13 : 9;
      for (let i = 0; i < count; i++) {
        const a = base - 0.65 + (1.3 * i) / (count - 1);
        G.enemyBullets.push({ x: boss.x, y: boss.y + 30, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 8, t: 0, color: 'pink' });
      }
      addRing(boss.x, boss.y + 30, 'rgba(255,80,170,0.5)', 12, 70, 0.3, 3);
      boss.attackCd = 1.5 * phase;
    } else if (mode === 1) {
      // aimed burst
      for (let i = -1; i <= 1; i++) {
        const a = Math.atan2(p.y - boss.y, p.x - boss.x) + i * 0.16;
        G.enemyBullets.push({ x: boss.x + i * 30, y: boss.y + 26, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 7, t: 0, color: 'orange' });
      }
      boss.attackCd = 1.0 * phase;
    } else if (mode === 2) {
      // spiral
      boss.spiral += 0.34;
      const arms = boss.phase2 ? 5 : 3;
      for (let i = 0; i < arms; i++) {
        const a = boss.spiral + (i * TAU) / arms;
        G.enemyBullets.push({ x: boss.x, y: boss.y + 20, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, r: 7, t: 0, color: 'purple' });
      }
      boss.attackCd = 0.16;
    } else if (mode === 3) {
      // rain from sides
      for (let i = 0; i < 4; i++) {
        G.enemyBullets.push({
          x: boss.x + rand(-90, 90),
          y: boss.y + 40,
          vx: rand(-40, 40),
          vy: rand(230, 300),
          r: 7,
          t: 0,
          color: 'pink'
        });
      }
      boss.attackCd = 0.5 * phase;
    } else {
      // summon
      if (G.enemies.filter((e) => !e.boss).length < 5) {
        const t = pick(unlockedTypes());
        spawnEnemy(t, boss.x - 80, boss.y);
        spawnEnemy(t, boss.x + 80, boss.y);
      }
      boss.attackCd = 2.2;
    }
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 0.08;
    if (e.hp <= 0) {
      killEnemy(e);
    }
  }

  function killEnemy(e) {
    const idx = G.enemies.indexOf(e);
    if (idx === -1) return;
    G.enemies.splice(idx, 1);

    G.streak++;
    G.streakTimer = 2.6;

    if (e.boss) {
      G.boss = null;
      $('bossBar').classList.add('hidden');
      G.flash = 0.8;
      G.shake = 30;
      addParticles(e.x, e.y, 90, 'rgba(255,180,80,0.95)', 480, 9, 1.4);
      addParticles(e.x, e.y, 50, 'rgba(255,80,150,0.9)', 380, 7, 1.1);
      addRing(e.x, e.y, 'rgba(255,220,140,0.95)', 30, 420, 0.9, 8);
      const gain = e.score * comboMultiplier();
      G.score += gain;
      addText(e.x, e.y, '+' + gain, '#ffd76a', 30);
      for (let i = 0; i < 5; i++) {
        const types = ['weapon', 'shield', 'bomb', 'coin', 'life'];
        maybeDrop(e.x + rand(-70, 70), e.y + rand(-20, 20), 1, types[i]);
      }
      Sound.play('explode', 1, 0.8);
      Sound.play('win', 0.5);
      showBanner('BOSS YOK EDİLDİ', '+' + gain + ' PUAN', 2, '#ffd76a');
    } else {
      addParticles(e.x, e.y, 16, 'rgba(255,150,80,0.9)', 260, 5, 0.6);
      addRing(e.x, e.y, 'rgba(255,190,110,0.7)', 6, 60, 0.35, 2);
      const gain = e.score * comboMultiplier();
      G.score += gain;
      addText(e.x, e.y - 10, '+' + gain, '#9fe6ff', 14);
      maybeDrop(e.x, e.y);
      Sound.play('explode_small', 0.35, rand(0.9, 1.15));
    }
  }

  /* ------------------------------------------------------------------ *
   *  Waves
   * ------------------------------------------------------------------ */

  function showBanner(text, sub, time = 1.6, color = '#8fe6ff') {
    G.banner = { text, sub, life: time, max: time, color };
  }

  function startWave() {
    G.wave++;
    updateHud();
    G.spawnQueue = [];
    G.waveSpawning = true;
    G.waveClearTimer = 0;

    if (G.wave % 5 === 0) {
      G.spawnQueue.push({ t: 1.5, fn: spawnBoss });
      showBanner('DALGA ' + G.wave, 'BOSS SAVAŞI', 1.6, '#ff77b9');
      Sound.play('warning', 0.4);
      return;
    }

    const count = Math.min(20, 5 + Math.round(G.wave * 1.5));
    const types = unlockedTypes();
    let t = 0.4;
    let lastX = W / 2;
    let i = 0;

    while (i < count) {
      const type = pick(types);
      const delay = t;
      const roll = Math.random();

      if (G.wave >= 3 && roll < 0.26 && count - i >= 3) {
        // V formation
        const cx = rand(140, W - 140);
        const n = Math.random() < 0.4 && count - i >= 5 ? 5 : 3;
        for (let j = 0; j < n; j++) {
          const off = (j - (n - 1) / 2) * 54;
          const x = clamp(cx + off, 55, W - 55);
          G.spawnQueue.push({ t: delay + Math.abs(off) * 0.0016, fn: () => spawnEnemy(type, x) });
        }
        i += n;
        t += 1.15;
      } else if (G.wave >= 4 && roll < 0.38) {
        // side sweep
        const fromLeft = Math.random() < 0.5;
        const y = rand(110, 250);
        G.spawnQueue.push({
          t: delay,
          fn: () => spawnEnemy(type, fromLeft ? -70 : W + 70, y, { pattern: 'cross', vx: fromLeft ? 170 : -170 })
        });
        i++;
        t += 0.55;
      } else {
        let x = rand(70, W - 70);
        if (Math.abs(x - lastX) < 60) x = clamp(x + 110, 70, W - 70);
        lastX = x;
        G.spawnQueue.push({ t: delay, fn: () => spawnEnemy(type, x) });
        i++;
        t += Math.max(0.3, 0.66 - G.wave * 0.012) * (i % 3 === 2 ? 1.4 : 1);
      }
    }

    if (G.wave % 5 === 1) {
      const zi = zoneIndex();
      showBanner('BÖLGE ' + (Math.floor((G.wave - 1) / 5) + 1), ZONES[zi].name + ' · ' + count + ' HEDEF', 1.7, '#a9c6ff');
    } else {
      showBanner('DALGA ' + G.wave, count + ' HEDEF', 1.5);
    }
  }

  function waveComplete() {
    G.waveSpawning = false;
    const bonus = G.wave * 50;
    G.score += bonus;
    updateHud();
    showBanner('DALGA TEMİZ', '+' + bonus + ' BONUS', 1.8, '#7fffd4');
    Sound.play('win', 0.3);
    G.waveClearTimer = 1.9;
  }

  /* ------------------------------------------------------------------ *
   *  Main update
   * ------------------------------------------------------------------ */

  function update(dt) {
    G.time += dt;
    G.bgOffset += dt * (G.state === 'playing' ? 42 : 14);

    // stars
    const speedScale = G.state === 'playing' ? 1 : 0.35;
    for (const s of G.stars) {
      s.y += s.s * dt * speedScale;
      s.tw += dt * 2;
      if (s.y > H + 4) {
        s.y = -4;
        s.x = Math.random() * W;
      }
    }

    if (G.state !== 'playing') {
      // menu idle particles
      return;
    }

    G.streakTimer -= dt;
    if (G.streakTimer <= 0 && G.streak > 0) {
      G.streak = 0;
    }
    updateHud();

    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateSpawning(dt);

    G.shake = Math.max(0, G.shake - dt * 55);
    G.flash = Math.max(0, G.flash - dt * 2.8);

    if (G.state === 'playing' && !G.waveSpawning && G.enemies.length === 0 && G.waveClearTimer <= 0) {
      waveComplete();
    }
    if (G.waveClearTimer > 0) {
      G.waveClearTimer -= dt;
      if (G.waveClearTimer <= 0) startWave();
    }
  }

  function updatePlayer(dt) {
    const p = G.player;
    const k = G.keys;

    let kx = 0;
    let ky = 0;
    if (k['ArrowLeft'] || k['KeyA']) kx -= 1;
    if (k['ArrowRight'] || k['KeyD']) kx += 1;
    if (k['ArrowUp'] || k['KeyW']) ky -= 1;
    if (k['ArrowDown'] || k['KeyS']) ky += 1;

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky) || 1;
      p.tx = clamp(p.tx + (kx / len) * p.speed * dt, 30, W - 30);
      p.ty = clamp(p.ty + (ky / len) * p.speed * dt, 110, H - 50);
      G.mouseActive = false;
    }

    const follow = 1 - Math.pow(0.001, dt * (1.2 * p.ship.speed));
    const nx = lerp(p.x, p.tx, follow);
    p.vx = (nx - p.x) / Math.max(dt, 0.001);
    p.x = clamp(nx, 26, W - 26);
    p.y = clamp(lerp(p.y, p.ty, follow), 100, H - 46);

    p.tilt = lerp(p.tilt, clamp(p.vx / 1600, -0.22, 0.22), 0.12);

    if (p.invuln > 0) p.invuln -= dt;

    playerFire(dt);

    // engine trail
    if (Math.random() < 0.7) {
      G.particles.push({
        x: p.x + rand(-6, 6),
        y: p.y + 30,
        vx: rand(-18, 18),
        vy: rand(90, 160),
        life: 0.3,
        max: 0.3,
        size: rand(2, 4.5),
        color: 'rgba(90,200,255,0.75)'
      });
    }
  }

  function updateBullets(dt) {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.t += dt;
      if (b.y < -40 || b.y > H + 40 || b.x < -40 || b.x > W + 40) {
        G.bullets.splice(i, 1);
        continue;
      }
      let hit = false;
      for (const e of G.enemies) {
        const rr = e.r + b.r;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
          damageEnemy(e, b.dmg);
          addParticles(b.x, b.y, 3, 'rgba(120,240,255,0.9)', 90, 3, 0.25);
          hit = true;
          break;
        }
      }
      if (hit) G.bullets.splice(i, 1);
    }

    for (let i = G.enemyBullets.length - 1; i >= 0; i--) {
      const b = G.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.t += dt;
      if (b.y > H + 40 || b.y < -60 || b.x < -60 || b.x > W + 60) {
        G.enemyBullets.splice(i, 1);
        continue;
      }
      const p = G.player;
      const rr = p.r + b.r;
      if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr * rr) {
        G.enemyBullets.splice(i, 1);
        addParticles(b.x, b.y, 6, 'rgba(255,120,120,0.9)', 160, 4, 0.4);
        playerHit();
      }
    }
  }

  function updateEnemies(dt) {
    const p = G.player;
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;

      if (e.boss) {
        updateBoss(e, dt);
      } else {
        if (e.pattern === 'straight') {
          e.y += e.speed * dt;
          e.x = e.baseX;
        } else if (e.pattern === 'sine') {
          e.y += e.speed * dt;
          e.x = e.baseX + Math.sin(e.t * 2 + e.phase) * 55;
        } else if (e.pattern === 'dive') {
          e.y += e.speed * dt;
          e.x = e.baseX + Math.sin(e.t * 1.3 + e.phase) * 110;
          e.tilt = Math.cos(e.t * 1.3 + e.phase) * 0.4;
        } else if (e.pattern === 'cross') {
          e.x += e.vx * dt;
          e.y += e.speed * 0.55 * dt;
          e.tilt = e.vx > 0 ? 0.32 : -0.32;
        } else if (e.pattern === 'hover') {
          if (e.y < 220 + (e.baseX % 60)) {
            e.y += e.speed * dt;
          } else {
            e.x = e.baseX + Math.sin(e.t * 1.1 + e.phase) * 40;
            if (e.t > 7) e.y += 150 * dt;
          }
        }

        if (e.fireRate) {
          e.fireCd -= dt;
          if (e.fireCd <= 0 && e.y > 40 && e.y < H * 0.72) {
            e.fireCd = e.fireRate * rand(0.85, 1.2);
            enemyShoot(e);
          }
        }

        // enemy vs player
        if (p.invuln <= 0) {
          const rr = p.r + e.r * 0.7;
          if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < rr * rr) {
            damageEnemy(e, 999);
            playerHit();
            continue;
          }
        }
      }

      if (e.y > H + 140 || (e.x < -160 || e.x > W + 160)) {
        if (!e.boss) G.enemies.splice(i, 1);
      }
    }
  }

  function updateBoss(boss, dt) {
    if (boss.entering) {
      boss.y += 120 * dt;
      if (boss.y >= 250) {
        boss.y = 250;
        boss.entering = false;
      }
      return;
    }

    boss.phase2 = boss.hp < boss.maxHp * 0.45;
    boss.x = W / 2 + Math.sin(boss.t * 0.7) * 140;
    boss.y = 250 + Math.sin(boss.t * 1.4) * 16;

    boss.attackCd -= dt;
    if (boss.attackCd <= 0) bossAttack(boss);

    const fill = clamp(boss.hp / boss.maxHp, 0, 1) * 100;
    $('bossFill').style.width = fill + '%';
  }

  function updatePickups(dt) {
    const p = G.player;
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const u = G.pickups[i];
      u.t += dt;
      u.y += u.vy * dt;
      u.x += Math.sin(u.t * 2.4) * 22 * dt + u.vx * dt;
      if (u.y > H + 40) {
        G.pickups.splice(i, 1);
        continue;
      }
      const rr = p.r + 24;
      if ((p.x - u.x) ** 2 + (p.y - u.y) ** 2 < rr * rr) {
        collectPickup(u);
        G.pickups.splice(i, 1);
      }
    }
  }

  function collectPickup(u) {
    const p = G.player;
    if (u.type === 'weapon') {
      if (p.weapon < 5) {
        p.weapon++;
        addText(p.x, p.y - 40, 'SİLAH ' + p.weapon, '#6fe8ff', 16);
      } else {
        G.score += 120;
        addText(p.x, p.y - 40, '+120', '#6fe8ff', 16);
      }
      Sound.play('powerup', 0.6);
    } else if (u.type === 'shield') {
      p.shield = true;
      addText(p.x, p.y - 40, 'KALKAN', '#8aa4ff', 16);
      addRing(p.x, p.y, 'rgba(120,160,255,0.9)', 16, 80, 0.4, 3);
      Sound.play('powerup', 0.6, 1.15);
    } else if (u.type === 'bomb') {
      G.bombs = Math.min(3, G.bombs + 1);
      addText(p.x, p.y - 40, 'BOMBA +1', '#ffb45e', 16);
      Sound.play('coin', 0.6);
    } else if (u.type === 'life') {
      if (G.lives < 3) {
        G.lives++;
        updateHearts();
        addText(p.x, p.y - 40, 'CAN +1', '#ff7bb8', 18);
      } else {
        G.score += 250;
        addText(p.x, p.y - 40, '+250', '#ff7bb8', 18);
      }
      Sound.play('powerup', 0.8, 0.9);
    } else {
      const gain = 60 * comboMultiplier();
      G.score += gain;
      addText(p.x, p.y - 40, '+' + gain, '#ffd76a', 14);
      Sound.play('coin', 0.4);
    }
    updateHud();
  }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        G.particles.splice(i, 1);
        continue;
      }
      if (p.ring) {
        p.r = lerp(p.r, p.maxR, 1 - Math.pow(0.002, dt));
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
      }
    }

    for (let i = G.texts.length - 1; i >= 0; i--) {
      const t = G.texts[i];
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) G.texts.splice(i, 1);
    }

    if (G.banner) {
      G.banner.life -= dt;
      if (G.banner.life <= 0) G.banner = null;
    }
  }

  function updateSpawning(dt) {
    if (!G.waveSpawning) return;
    for (let i = G.spawnQueue.length - 1; i >= 0; i--) {
      const s = G.spawnQueue[i];
      s.t -= dt;
      if (s.t <= 0) {
        G.spawnQueue.splice(i, 1);
        s.fn();
      }
    }
    if (G.spawnQueue.length === 0) G.waveSpawning = false;
  }

  /* ------------------------------------------------------------------ *
   *  Rendering
   * ------------------------------------------------------------------ */

  let bgCanvas = null;
  let vignetteCanvas = null;

  function buildBackground() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');

    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#05030f');
    grad.addColorStop(0.4, '#0a0522');
    grad.addColorStop(0.75, '#060318');
    grad.addColorStop(1, '#03020a');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // soft nebula clouds, drawn wrapped vertically so the tile loops seamlessly
    const palette = [
      [110, 70, 255],
      [40, 120, 255],
      [220, 50, 190],
      [30, 200, 240],
      [140, 60, 200],
      [255, 90, 140]
    ];
    g.globalCompositeOperation = 'lighter';

    // two very large accent fields for depth
    for (let i = 0; i < 3; i++) {
      const x = i === 0 ? W * 0.25 : i === 1 ? W * 0.8 : W * 0.5;
      const y = i === 0 ? H * 0.22 : i === 1 ? H * 0.62 : H * 0.9;
      const r = rand(420, 620);
      const col = palette[i === 1 ? 2 : 0];
      for (const dy of [-H, 0, H]) {
        const rg = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        rg.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.13)`);
        rg.addColorStop(0.5, `rgba(${col[0]},${col[1]},${col[2]},0.05)`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(x - r, y + dy - r, r * 2, r * 2);
      }
    }

    for (let i = 0; i < 24; i++) {
      const x = rand(-60, W + 60);
      const y = rand(0, H);
      const r = rand(110, 300);
      const col = pick(palette);
      const a = rand(0.08, 0.2);
      for (const dy of [-H, 0, H]) {
        const rg = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        rg.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
        rg.addColorStop(0.55, `rgba(${col[0]},${col[1]},${col[2]},${a * 0.4})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(x - r, y + dy - r, r * 2, r * 2);
      }
    }

    // distant dust stars baked into the tile
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      g.globalAlpha = rand(0.08, 0.4);
      g.fillStyle = pick(['#bcd4ff', '#8fb4ff', '#ffffff', '#d5b8ff']);
      g.fillRect(x, y, rand(0.6, 1.6), rand(0.6, 1.6));
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    bgCanvas = c;

    const v = document.createElement('canvas');
    v.width = W;
    v.height = H;
    const vg = v.getContext('2d');
    const rg = vg.createRadialGradient(W / 2, H * 0.44, H * 0.18, W / 2, H * 0.46, H * 0.72);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.62)');
    vg.fillStyle = rg;
    vg.fillRect(0, 0, W, H);
    vignetteCanvas = v;
  }

  function drawBackground() {
    if (!bgCanvas) buildBackground();
    if (bgCanvas) {
      const off = ((G.bgOffset % H) + H) % H;
      ctx.drawImage(bgCanvas, 0, off - H);
      ctx.drawImage(bgCanvas, 0, off);
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = ZONES[zoneIndex()].color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (vignetteCanvas) ctx.drawImage(vignetteCanvas, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of G.stars) {
      const a = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(s.tw));
      ctx.fillStyle = s.z === 2 ? `rgba(190,220,255,${a})` : s.z === 1 ? `rgba(150,190,255,${a * 0.8})` : `rgba(120,160,230,${a * 0.55})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSprite(img, x, y, w, rot = 0, alpha = 1, flash = false) {
    if (!img || !img.width) return;
    const h = w * (img.height / img.width);
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    if (flash) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.55;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function drawBackground() {
    if (!bgCanvas) buildBackground();
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of G.stars) {
      const a = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(s.tw));
      ctx.fillStyle = s.z === 2 ? `rgba(190,220,255,${a})` : s.z === 1 ? `rgba(150,190,255,${a * 0.8})` : `rgba(120,160,230,${a * 0.55})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = G.player;
    if (!p) return;
    const blink = p.invuln > 0 && Math.floor(G.time * 16) % 2 === 0;
    const img = IMG[p.ship.img];
    if (!img) return;

    // engine flame
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.8 + Math.sin(G.time * 40) * 0.2;
    const fy = p.y + 30;
    const grd = ctx.createRadialGradient(p.x, fy, 2, p.x, fy + 8, 30 * flick);
    grd.addColorStop(0, 'rgba(180,240,255,0.9)');
    grd.addColorStop(0.4, 'rgba(80,170,255,0.55)');
    grd.addColorStop(1, 'rgba(20,60,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(p.x, fy + 10, 12 * flick, 30 * flick, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    drawSprite(img, p.x, p.y, 78, p.tilt, blink ? 0.35 : 1);

    if (p.shield) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.65 + Math.sin(G.time * 6) * 0.2;
      ctx.strokeStyle = `rgba(120,170,255,${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 46, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(190,220,255,${pulse * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 52, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const b of G.bullets) {
      const spr = FX.cyan;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(spr, b.x - 13, b.y - 22, 26, 42);
      ctx.fillStyle = 'rgba(235,255,255,0.95)';
      ctx.fillRect(b.x - 1.5, b.y - 9, 3, 16);
    }

    for (const b of G.enemyBullets) {
      const spr = b.color === 'pink' ? FX.pink : b.color === 'purple' ? FX.purple : b.color === 'orange' ? FX.orange : FX.red;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(spr, b.x - 15, b.y - 15, 30, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of G.enemies) {
      const img = IMG[e.img];
      if (!img) continue;
      drawSprite(img, e.x, e.y, e.w, e.tilt || 0, 1, e.flash > 0);
    }
  }

  function drawPickups() {
    ctx.save();
    for (const u of G.pickups) {
      const bob = Math.sin(u.t * 4) * 2;
      const map = {
        weapon: ['#45e6ff', 'P'],
        shield: ['#8aa4ff', 'S'],
        bomb: ['#ffb45e', 'B'],
        coin: ['#ffd76a', '★'],
        life: ['#ff5aa8', '♥']
      };
      const [color, glyph] = map[u.type] || ['#fff', '?'];
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(u.type === 'coin' ? FX.gold : u.type === 'shield' ? FX.blue : u.type === 'bomb' ? FX.orange : u.type === 'life' ? FX.pink : FX.cyan,
        u.x - 34, u.y + bob - 34, 68, 68);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(u.x, u.y + bob, 15, 0, TAU);
      ctx.fillStyle = 'rgba(8,12,30,0.85)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = '800 15px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, u.x, u.y + bob + 1);
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of G.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.ring) {
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * a + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.stroke();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawTexts() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of G.texts) {
      const a = clamp(t.life / t.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size}px "Segoe UI", sans-serif`;
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function drawBanner() {
    if (!G.banner) return;
    const b = G.banner;
    const t = 1 - b.life / b.max;
    const a = Math.min(1, b.life * 3, t * 6);
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '900 40px "Segoe UI", sans-serif';
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 30;
    ctx.fillText(b.text, W / 2, H * 0.34 - t * 6);

    ctx.shadowBlur = 8;
    ctx.font = '700 12px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(220,235,255,0.8)';
    ctx.fillText(b.sub, W / 2, H * 0.34 + 36);
    ctx.restore();
  }

  function drawMenuScene() {
    // subtle stars + player ship hovering for the menu backdrop behind DOM art
    drawBackground();
    ctx.save();
    ctx.globalAlpha = 0.9;
    const img = IMG[SHIPS[G.shipIndex].img];
    if (img) {
      const y = H * 0.78 + Math.sin(G.time * 1.4) * 8;
      drawSprite(img, W / 2, y, 110, Math.sin(G.time) * 0.05, 1);
    }
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const shakeX = G.shake ? rand(-G.shake, G.shake) * 0.5 : 0;
    const shakeY = G.shake ? rand(-G.shake, G.shake) * 0.5 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    if (G.state === 'menu' || G.state === 'boot' || G.state === 'over') {
      // background still drawn by menu DOM; canvas can show stars only
      drawBackground();
    } else {
      drawBackground();
      drawPickups();
      drawEnemies();
      drawBullets();
      drawPlayer();
      drawParticles();
      drawTexts();
      drawBanner();
    }

    ctx.restore();

    if (G.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, G.flash);
      ctx.fillStyle = G.state === 'playing' ? '#bfe9ff' : '#ffd9e8';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ *
   *  Flow
   * ------------------------------------------------------------------ */

  function resetGame() {
    G.score = 0;
    G.wave = 0;
    G.lives = 3;
    G.bombs = 2;
    G.streak = 0;
    G.streakTimer = 0;
    G.bullets = [];
    G.enemyBullets = [];
    G.enemies = [];
    G.pickups = [];
    G.particles = [];
    G.texts = [];
    G.spawnQueue = [];
    G.boss = null;
    G.waveSpawning = false;
    G.waveClearTimer = 0;
    G.banner = null;
    G.fireCd = 0;
    G.flash = 0;
    G.shake = 0;
    G.player = createPlayer();
    G.player.tx = W / 2;
    G.player.ty = H - 170;
    G.pointer = { x: W / 2, y: H - 170 };
    updateHearts();
    updateHud();
    $('bossBar').classList.add('hidden');
  }

  function startGame() {
    Sound.unlock();
    resetGame();
    G.state = 'playing';
    $('menu').classList.add('hidden');
    $('over').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    currentTrack = 'battle';
    Sound.playMusic('battle');
    startWave();
  }

  function gameOver() {
    G.state = 'over';
    G.overTimer = 0;
    Sound.play('lose', 0.9);
    Sound.stopMusic();
    currentTrack = 'menu';

    if (G.score > G.best) {
      G.best = G.score;
      Store.set('best', G.best);
      $('newRecord').classList.remove('hidden');
    } else {
      $('newRecord').classList.add('hidden');
    }

    $('bestScore').textContent = G.best.toLocaleString('tr-TR');
    $('finalScore').textContent = G.score.toLocaleString('tr-TR');
    $('finalWave').textContent = G.wave;
    $('finalBest').textContent = G.best.toLocaleString('tr-TR');
    $('hud').classList.add('hidden');
    $('bossBar').classList.add('hidden');

    setTimeout(() => {
      $('over').classList.remove('hidden');
    }, 900);
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    $('pauseScore').textContent = G.score.toLocaleString('tr-TR');
    $('pauseWave').textContent = G.wave;
    $('pause').classList.remove('hidden');
    Sound.musicEls.battle.pause();
  }

  function resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    $('pause').classList.add('hidden');
    if (Sound.enabled) Sound.playMusic('battle');
    lastTime = performance.now();
  }

  function goHome() {
    G.state = 'menu';
    $('hud').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('over').classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('bestScore').textContent = G.best.toLocaleString('tr-TR');
    currentTrack = 'menu';
    if (Sound.enabled) Sound.playMusic('menu');
    Sound.musicEls.battle.pause();
  }

  /* ------------------------------------------------------------------ *
   *  Input
   * ------------------------------------------------------------------ */

  function canvasPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * W,
      y: ((ev.clientY - rect.top) / rect.height) * H
    };
  }

  function onDown(ev) {
    Sound.unlock();
    if (G.state !== 'playing') return;
    const pt = canvasPoint(ev);
    G.dragging = true;
    G.mouseActive = true;
    const touch = ev.pointerType === 'touch';
    G.player.tx = clamp(pt.x, 30, W - 30);
    G.player.ty = clamp(touch ? pt.y - 70 : pt.y, 110, H - 50);
    G.pointer = pt;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    }
  }

  function onMove(ev) {
    if (G.state !== 'playing' || !G.dragging) return;
    const pt = canvasPoint(ev);
    const touch = ev.pointerType === 'touch';
    G.player.tx = clamp(pt.x, 30, W - 30);
    G.player.ty = clamp(touch ? pt.y - 70 : pt.y, 110, H - 50);
    G.pointer = pt;
  }

  function onUp() {
    G.dragging = false;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    G.keys[e.code] = true;
    Sound.unlock();

    if (e.code === 'Space' && G.state === 'playing') useBomb();
    if ((e.code === 'KeyP' || e.code === 'Escape')) {
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'paused') resumeGame();
    }
    if (e.code === 'Enter' && G.state === 'menu') startGame();
  });

  window.addEventListener('keyup', (e) => {
    G.keys[e.code] = false;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing') pauseGame();
  });

  window.addEventListener('blur', () => {
    if (G.state === 'playing') pauseGame();
  });

  /* ------------------------------------------------------------------ *
   *  UI wiring
   * ------------------------------------------------------------------ */

  function buildShipCards() {
    const wrap = $('shipList');
    wrap.innerHTML = '';
    SHIPS.forEach((s, i) => {
      const card = document.createElement('button');
      card.className = 'ship-card' + (i === G.shipIndex ? ' active' : '');
      card.type = 'button';
      card.innerHTML = `<img src="${IMG_SRC[s.img]}" alt="${s.name}"><span class="ship-name">${s.name}</span>`;
      card.addEventListener('click', () => {
        G.shipIndex = i;
        Store.set('ship', i);
        document.querySelectorAll('.ship-card').forEach((c, j) => c.classList.toggle('active', j === i));
        $('shipStats').textContent = s.desc;
        Sound.play('coin', 0.25);
        if (G.player) G.player.ship = s;
      });
      wrap.appendChild(card);
    });
    $('shipStats').textContent = SHIPS[G.shipIndex].desc;
  }

  function updateSoundLabel() {
    $('soundLabel').textContent = Sound.enabled ? 'SES: AÇIK' : 'SES: KAPALI';
    $('btnSound').setAttribute('aria-pressed', String(Sound.enabled));
  }

  function wireUi() {
    $('btnPlay').addEventListener('click', () => {
      Sound.unlock();
      startGame();
    });
    $('btnHow').addEventListener('click', () => {
      Sound.unlock();
      $('howto').classList.remove('hidden');
    });
    $('btnHowClose').addEventListener('click', () => $('howto').classList.add('hidden'));
    $('btnSound').addEventListener('click', () => {
      Sound.enabled = !Sound.enabled;
      Store.set('sound', Sound.enabled);
      Sound.setEnabled(Sound.enabled);
      updateSoundLabel();
      Sound.unlock();
    });
    $('btnPause').addEventListener('click', pauseGame);
    $('btnResume').addEventListener('click', resumeGame);
    $('btnQuit').addEventListener('click', goHome);
    $('btnRetry').addEventListener('click', startGame);
    $('btnHome').addEventListener('click', goHome);
    $('btnBomb').addEventListener('click', useBomb);
  }

  /* ------------------------------------------------------------------ *
   *  Resize / DPR
   * ------------------------------------------------------------------ */

  let dpr = 1;

  function resize() {
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const scale = Math.min(vw / W, vh / H);
    const stage = $('stage');
    stage.style.transform = `translate(${(vw - W * scale) / 2}px, ${(vh - H * scale) / 2}px) scale(${scale})`;
    stage.style.left = '0';
    stage.style.top = '0';

    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
  }

  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  /* ------------------------------------------------------------------ *
   *  Boot
   * ------------------------------------------------------------------ */

  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min(0.034, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function boot() {
    resize();
    makeStars();
    G.state = 'boot';

    Sound.enabled = Store.get('sound', true);
    updateSoundLabel();
    Sound.init();

    const loaderFill = $('loaderFill');
    let pct = 0;
    const tick = setInterval(() => {
      pct = Math.min(92, pct + rand(4, 14));
      loaderFill.style.width = pct + '%';
    }, 90);

    preloadImages(() => {
      clearInterval(tick);
      loaderFill.style.width = '100%';
      setTimeout(() => {
        $('boot').classList.add('hidden');
        $('menu').classList.remove('hidden');
        G.state = 'menu';
        G.best = Store.get('best', 0);
        $('bestScore').textContent = G.best.toLocaleString('tr-TR');
        buildShipCards();
        buildBackground();
        G.player = createPlayer();
        lastTime = performance.now();
      }, 260);
    });

    wireUi();
    requestAnimationFrame(loop);

    // start menu music on first interaction (autoplay policy)
    const unlockOnce = () => {
      Sound.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
  }

  boot();

  // exposed for debugging / automated smoke tests
  window.__SS = G;
})();
