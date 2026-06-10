"use strict";

// Beginner-friendly tuning values. Change these first when adjusting game feel.
const CONFIG = {
  enemySpawnRate: 1.65,        // Seconds between enemies at wave 1
  enemySpeed: 0.045,           // Base approach progress per second
  energyMax: 100,
  energyRegen: 9.5,            // Energy restored per second by the Bio-Tether
  shotEnergyCost: 10,
  pulseEnergyCost: 32,
  heatPerShot: 15,
  pulseHeat: 36,
  heatDecay: 12,               // Heat removed per second
  hitRadius: 48,
  pulseRadius: 150,
  waveTarget: 7,               // Intercepts needed to advance a wave
  waveSpeedScaling: 0.12,
  waveSpawnScaling: 0.09,
  maxMissedBeforeCompromised: 6,
  overheatRecoveryPoint: 55,
};

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startCard = document.getElementById("startCard");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");

let width = window.innerWidth;
let height = window.innerHeight;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
let lastTime = performance.now();
let elapsed = 0;
let spawnTimer = 0;
let started = false;
let stars = [];
let enemies = [];
let effects = [];

const state = {
  energy: CONFIG.energyMax,
  heat: 0,
  overheated: false,
  wave: 1,
  score: 0,
  missed: 0,
  waveIntercepts: 0,
  zoomIndex: 0,
  zoomLevels: [1, 4, 12],
  aimX: width / 2,
  aimY: height / 2,
  targetAimX: width / 2,
  targetAimY: height / 2,
  shake: 0,
  flash: 0,
  blockedFlash: 0,
  scan: 0,
  scanCooldown: 0,
  statusMessage: "BIO-TETHER SYNCHRONIZED",
  statusTimer: 3,
};

// Resize the canvas while keeping its drawing coordinates in CSS pixels.
function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  if (!Number.isFinite(state.aimX)) {
    state.aimX = width / 2;
    state.aimY = height / 2;
  }
  state.targetAimX = clamp(state.targetAimX, width * 0.2, width * 0.8);
  state.targetAimY = clamp(state.targetAimY, height * 0.18, height * 0.72);
  createStarField();
}

// A fixed star field makes the background feel stable while aiming.
function createStarField() {
  const count = Math.floor((width * height) / 6200);
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height * 0.72,
    size: Math.random() * 1.3 + 0.2,
    alpha: Math.random() * 0.75 + 0.15,
    pulse: Math.random() * Math.PI * 2,
  }));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function setStatus(message, duration = 1.6) {
  state.statusMessage = message;
  state.statusTimer = duration;
}

// Return current screen coordinates for an incoming projectile.
function getEnemyScreenPosition(enemy) {
  const approachCurve = enemy.progress * enemy.progress;
  const x = width * (enemy.startX + enemy.driftX * approachCurve);
  const y = height * (enemy.startY + enemy.driftY * approachCurve);
  const size = lerp(2.2, 18, approachCurve);
  return { x, y, size };
}

// Spawn enemies in the sky with a slight approach vector toward the defense line.
function spawnEnemy() {
  const sideBias = Math.random();
  const startX = sideBias < 0.5
    ? randomBetween(0.18, 0.48)
    : randomBetween(0.52, 0.84);
  const startY = randomBetween(0.1, 0.46);
  const driftTowardCenter = (0.5 - startX) * randomBetween(0.1, 0.35);

  enemies.push({
    id: Math.random().toString(36).slice(2),
    startX,
    startY,
    driftX: driftTowardCenter + randomBetween(-0.07, 0.07),
    driftY: randomBetween(0.12, 0.35),
    progress: 0,
    speed: CONFIG.enemySpeed * randomBetween(0.82, 1.22)
      * (1 + (state.wave - 1) * CONFIG.waveSpeedScaling),
    trail: [],
    phase: Math.random() * Math.PI * 2,
    scanned: 0,
  });
}

// Reset all gameplay values without reloading the page.
function resetSimulation() {
  enemies = [];
  effects = [];
  Object.assign(state, {
    energy: CONFIG.energyMax,
    heat: 0,
    overheated: false,
    wave: 1,
    score: 0,
    missed: 0,
    waveIntercepts: 0,
    zoomIndex: 0,
    shake: 0,
    flash: 0,
    blockedFlash: 0,
    scan: 0,
    scanCooldown: 0,
    statusMessage: "SYSTEM RECALIBRATED",
    statusTimer: 2.5,
  });
  spawnTimer = 0.8;
}

// Check which enemy is closest to the aim point and inside the allowed radius.
function findTarget(radiusMultiplier = 1) {
  let bestTarget = null;
  let closestDistance = Infinity;
  const zoomAssist = [1, 1.12, 1.28][state.zoomIndex];
  const allowedRadius = CONFIG.hitRadius * radiusMultiplier * zoomAssist;

  for (const enemy of enemies) {
    const position = getEnemyScreenPosition(enemy);
    const distance = Math.hypot(position.x - state.aimX, position.y - state.aimY);
    if (distance < allowedRadius + position.size && distance < closestDistance) {
      bestTarget = enemy;
      closestDistance = distance;
    }
  }
  return bestTarget;
}

function addExplosion(x, y, color = "#ff5d3b", large = false) {
  effects.push({
    type: "explosion",
    x,
    y,
    life: large ? 0.65 : 0.42,
    maxLife: large ? 0.65 : 0.42,
    size: large ? 85 : 48,
    color,
  });
}

function destroyEnemy(enemy, pulse = false) {
  const position = getEnemyScreenPosition(enemy);
  enemies = enemies.filter((candidate) => candidate !== enemy);
  addExplosion(position.x, position.y, pulse ? "#b8ff9a" : "#ff6245", pulse);
  state.score += pulse ? 160 : 100;
  state.waveIntercepts += 1;
  setStatus(pulse ? "HIGH-OUTPUT INTERCEPT CONFIRMED" : "INTERCEPT CONFIRMED");

  if (state.waveIntercepts >= CONFIG.waveTarget) {
    state.wave += 1;
    state.waveIntercepts = 0;
    state.energy = Math.min(CONFIG.energyMax, state.energy + 22);
    state.heat = Math.max(0, state.heat - 24);
    setStatus(`WAVE ${state.wave} THREAT PROFILE LOADED`, 2.8);
  }
}

// Fire the standard lance. It is accurate, cheap, and adds moderate heat.
function firePrimary() {
  if (!started) return;
  if (state.overheated || state.energy < CONFIG.shotEnergyCost) {
    state.blockedFlash = 1;
    setStatus(state.overheated ? "WEAPON LOCKED // THERMAL RECOVERY" : "INSUFFICIENT TETHER ENERGY");
    return;
  }

  state.energy -= CONFIG.shotEnergyCost;
  state.heat = Math.min(100, state.heat + CONFIG.heatPerShot);
  state.shake = 1;
  state.flash = 0.48;

  const target = findTarget();
  const endX = target ? getEnemyScreenPosition(target).x : state.aimX;
  const endY = target ? getEnemyScreenPosition(target).y : state.aimY;
  effects.push({
    type: "beam",
    startX: width / 2,
    startY: height * 0.93,
    endX,
    endY,
    life: 0.13,
    maxLife: 0.13,
    color: target ? "#d5ffad" : "#87ff83",
    width: 2.5,
  });

  if (target) destroyEnemy(target);
  else setStatus("LANCE DISCHARGED // NO LOCK", 0.8);

  if (state.heat >= 100) {
    state.overheated = true;
    setStatus("WEAPON TEMP CRITICAL // AUTO-LOCK", 3);
  }
}

// High-output pulse hits every enemy near the aim point, but taxes the tether.
function firePulse() {
  if (!started) return;
  if (state.overheated || state.energy < CONFIG.pulseEnergyCost) {
    state.blockedFlash = 1;
    setStatus(state.overheated ? "PULSE LOCKED // THERMAL RECOVERY" : "PULSE CHARGE INSUFFICIENT");
    return;
  }

  state.energy -= CONFIG.pulseEnergyCost;
  state.heat = Math.min(100, state.heat + CONFIG.pulseHeat);
  state.shake = 1.8;
  state.flash = 0.85;
  effects.push({
    type: "pulse",
    x: state.aimX,
    y: state.aimY,
    life: 0.55,
    maxLife: 0.55,
    size: CONFIG.pulseRadius,
    color: "#bfffaa",
  });
  effects.push({
    type: "beam",
    startX: width / 2,
    startY: height * 0.94,
    endX: state.aimX,
    endY: state.aimY,
    life: 0.28,
    maxLife: 0.28,
    color: "#e7ffcc",
    width: 8,
  });

  const hits = enemies.filter((enemy) => {
    const position = getEnemyScreenPosition(enemy);
    return Math.hypot(position.x - state.aimX, position.y - state.aimY)
      < CONFIG.pulseRadius + position.size;
  });
  hits.forEach((enemy) => destroyEnemy(enemy, true));
  if (hits.length === 0) setStatus("HIGH-OUTPUT PULSE // NO CONTACT", 1);

  if (state.heat >= 100) {
    state.overheated = true;
    setStatus("WEAPON TEMP CRITICAL // AUTO-LOCK", 3);
  }
}

function triggerScan() {
  if (!started || state.scanCooldown > 0) return;
  state.scan = 1;
  state.scanCooldown = 3.2;
  enemies.forEach((enemy) => { enemy.scanned = 2.2; });
  setStatus(`${enemies.length} INBOUND SIGNATURES RESOLVED`, 1.6);
}

function cycleZoom(direction = 1) {
  state.zoomIndex = (state.zoomIndex + direction + state.zoomLevels.length) % state.zoomLevels.length;
  setStatus(`OPTICAL MAGNIFICATION ${state.zoomLevels[state.zoomIndex]}X`, 1);
}

// Update simulation values using seconds, so gameplay is frame-rate independent.
function update(delta) {
  elapsed += delta;
  state.aimX = lerp(state.aimX, state.targetAimX, Math.min(1, delta * 14));
  state.aimY = lerp(state.aimY, state.targetAimY, Math.min(1, delta * 14));
  state.energy = Math.min(CONFIG.energyMax, state.energy + CONFIG.energyRegen * delta);
  state.heat = Math.max(0, state.heat - CONFIG.heatDecay * delta);
  state.shake = Math.max(0, state.shake - delta * 7);
  state.flash = Math.max(0, state.flash - delta * 3.8);
  state.blockedFlash = Math.max(0, state.blockedFlash - delta * 2.5);
  state.scan = Math.max(0, state.scan - delta * 0.58);
  state.scanCooldown = Math.max(0, state.scanCooldown - delta);
  state.statusTimer = Math.max(0, state.statusTimer - delta);

  if (state.overheated && state.heat <= CONFIG.overheatRecoveryPoint) {
    state.overheated = false;
    setStatus("THERMAL LOCK RELEASED", 1.8);
  }

  if (started) {
    spawnTimer -= delta;
    if (spawnTimer <= 0) {
      spawnEnemy();
      const interval = CONFIG.enemySpawnRate
        / (1 + (state.wave - 1) * CONFIG.waveSpawnScaling);
      spawnTimer = interval * randomBetween(0.72, 1.24);
    }
  }

  for (const enemy of enemies) {
    enemy.progress += enemy.speed * delta;
    enemy.scanned = Math.max(0, enemy.scanned - delta);
    const position = getEnemyScreenPosition(enemy);
    enemy.trail.unshift({ x: position.x, y: position.y });
    if (enemy.trail.length > 8) enemy.trail.pop();
  }

  const missedEnemies = enemies.filter((enemy) => enemy.progress >= 1);
  if (missedEnemies.length > 0) {
    state.missed += missedEnemies.length;
    missedEnemies.forEach((enemy) => {
      const position = getEnemyScreenPosition(enemy);
      addExplosion(position.x, position.y, "#ff2f24", true);
    });
    enemies = enemies.filter((enemy) => enemy.progress < 1);
    state.shake = 2;
    state.flash = 1;
    setStatus("DEFENSE LINE IMPACT DETECTED", 2.2);
  }

  for (const effect of effects) effect.life -= delta;
  effects = effects.filter((effect) => effect.life > 0);
}

function drawLine(x1, y1, x2, y2, color, lineWidth = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawBackground() {
  const gradient = ctx.createRadialGradient(width * 0.56, height * 0.35, 20, width * 0.5, height * 0.35, width * 0.75);
  gradient.addColorStop(0, "#071410");
  gradient.addColorStop(0.45, "#020706");
  gradient.addColorStop(1, "#000101");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    const flicker = 0.72 + Math.sin(elapsed * 1.5 + star.pulse) * 0.28;
    ctx.fillStyle = `rgba(205, 235, 222, ${star.alpha * flicker})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
}

function drawEarth() {
  const radius = Math.min(width, height) * 0.17;
  const x = width * 0.67;
  const y = height * 0.32;

  ctx.save();
  ctx.shadowColor = "#5da8d9";
  ctx.shadowBlur = 28;
  const ocean = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.38, radius * 0.08, x, y, radius);
  ocean.addColorStop(0, "#b8d6df");
  ocean.addColorStop(0.18, "#4b8291");
  ocean.addColorStop(0.55, "#204c62");
  ocean.addColorStop(0.88, "#102a3b");
  ocean.addColorStop(1, "#02090e");
  ctx.fillStyle = ocean;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.clip();

  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#aebf9d";
  for (let i = 0; i < 14; i += 1) {
    const angle = i * 2.15;
    const blobX = x + Math.sin(angle) * radius * (0.22 + (i % 5) * 0.1);
    const blobY = y + Math.cos(angle * 1.3) * radius * (0.18 + (i % 4) * 0.11);
    ctx.beginPath();
    ctx.ellipse(blobX, blobY, radius * (0.09 + (i % 4) * 0.038), radius * (0.035 + (i % 3) * 0.022), angle, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(210, 240, 245, 0.24)";
  ctx.lineWidth = radius * 0.035;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.arc(
      x + Math.sin(i * 2.8) * radius * 0.34,
      y + Math.cos(i * 1.9) * radius * 0.42,
      radius * (0.28 + (i % 4) * 0.11),
      0.2,
      2.6,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawMoonSurface() {
  const horizonY = height * 0.67;
  const terrain = [
    [0, 0.7], [0.08, 0.63], [0.17, 0.69], [0.26, 0.61], [0.35, 0.67],
    [0.44, 0.64], [0.53, 0.68], [0.62, 0.62], [0.71, 0.69], [0.8, 0.61],
    [0.9, 0.66], [1, 0.62],
  ];
  const ground = ctx.createLinearGradient(0, horizonY, 0, height);
  ground.addColorStop(0, "#2e3432");
  ground.addColorStop(0.35, "#151b19");
  ground.addColorStop(1, "#050806");
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, height * terrain[0][1]);
  terrain.forEach(([x, y]) => ctx.lineTo(width * x, height * y));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(183, 199, 188, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    const y = horizonY + i * i * 1.1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(width * 0.5, y - 10 + i, width, y + Math.sin(i) * 6);
    ctx.stroke();
  }

  for (let i = 0; i < 22; i += 1) {
    const craterX = ((i * 193) % 997) / 997 * width;
    const craterY = height * (0.69 + (((i * 67) % 100) / 100) * 0.25);
    const craterSize = 4 + (((i * 41) % 70) / 70) * 28 * (craterY / height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(craterX, craterY, craterSize * 1.8, craterSize * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(175, 190, 182, 0.12)";
    ctx.stroke();
  }
}

function drawWeapon() {
  const centerX = width / 2;
  const baseY = height + 18;
  const tipY = height * 0.69;
  const weaponWidth = Math.min(width * 0.23, 310);

  ctx.save();
  ctx.shadowColor = "#61ff79";
  ctx.shadowBlur = 8 + state.flash * 18;

  const bodyGradient = ctx.createLinearGradient(centerX, tipY, centerX, baseY);
  bodyGradient.addColorStop(0, "#263529");
  bodyGradient.addColorStop(0.38, "#101b14");
  bodyGradient.addColorStop(1, "#050805");
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = "rgba(123, 255, 127, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, tipY);
  ctx.bezierCurveTo(centerX - 18, tipY + 34, centerX - weaponWidth * 0.24, height * 0.84, centerX - weaponWidth, baseY);
  ctx.lineTo(centerX + weaponWidth, baseY);
  ctx.bezierCurveTo(centerX + weaponWidth * 0.24, height * 0.84, centerX + 18, tipY + 34, centerX, tipY);
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < 8; i += 1) {
    const t = i / 8;
    const y = lerp(tipY + 12, height * 0.98, t);
    const spread = lerp(5, weaponWidth * 0.42, t);
    drawLine(centerX - spread, y, centerX + spread, y, "#6cff80", 1.2, 0.22 + state.flash * 0.35);
    ctx.fillStyle = `rgba(124, 255, 130, ${0.22 + state.flash * 0.4})`;
    ctx.beginPath();
    ctx.arc(centerX, y, lerp(2, 7, t), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(121, 255, 129, 0.35)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(centerX + weaponWidth * 0.35, height);
  ctx.bezierCurveTo(width * 0.73, height * 0.9, width * 0.79, height * 0.82, width * 0.88, height * 0.76);
  ctx.stroke();
  ctx.strokeStyle = "rgba(192, 255, 176, 0.42)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 12]);
  ctx.lineDashOffset = -elapsed * 40;
  ctx.stroke();
  ctx.restore();
}

function drawEnemies() {
  const target = findTarget();
  for (const enemy of enemies) {
    const position = getEnemyScreenPosition(enemy);
    const danger = enemy.progress > 0.72;
    const lock = enemy === target;
    const color = lock ? "#d7ffb2" : danger ? "#ff3d2f" : "#ff664f";
    const alpha = clamp(0.42 + enemy.progress * 0.7, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + position.size;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    enemy.trail.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.fillStyle = "#fff1dd";
    ctx.beginPath();
    ctx.arc(position.x, position.y, Math.max(1.5, position.size * 0.35), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const boxSize = 18 + position.size * 1.65 + (lock ? Math.sin(elapsed * 8) * 3 : 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = lock ? 1.7 : 1;
    ctx.globalAlpha = lock ? 1 : 0.82;
    drawCornerBox(position.x, position.y, boxSize, color);

    const distanceKm = Math.max(900, Math.floor((1 - enemy.progress) * 580000));
    ctx.fillStyle = color;
    ctx.font = `${Math.max(8, Math.min(12, width * 0.008))}px "Courier New"`;
    ctx.textAlign = "left";
    ctx.fillText(lock ? "LOCK // INBOUND" : "△ INBOUND", position.x + boxSize + 7, position.y - 5);
    ctx.fillText(`${distanceKm.toLocaleString()} KM`, position.x + boxSize + 7, position.y + 10);

    if (enemy.scanned > 0) {
      ctx.fillStyle = "rgba(176, 255, 156, 0.75)";
      ctx.fillText(`VEL ${(enemy.speed * 250).toFixed(1)} KM/S`, position.x + boxSize + 7, position.y + 25);
    }
    ctx.globalAlpha = 1;
  }
}

function drawCornerBox(x, y, halfSize, color) {
  const corner = Math.max(5, halfSize * 0.32);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - halfSize, y - halfSize + corner);
  ctx.lineTo(x - halfSize, y - halfSize);
  ctx.lineTo(x - halfSize + corner, y - halfSize);
  ctx.moveTo(x + halfSize - corner, y - halfSize);
  ctx.lineTo(x + halfSize, y - halfSize);
  ctx.lineTo(x + halfSize, y - halfSize + corner);
  ctx.moveTo(x + halfSize, y + halfSize - corner);
  ctx.lineTo(x + halfSize, y + halfSize);
  ctx.lineTo(x + halfSize - corner, y + halfSize);
  ctx.moveTo(x - halfSize + corner, y + halfSize);
  ctx.lineTo(x - halfSize, y + halfSize);
  ctx.lineTo(x - halfSize, y + halfSize - corner);
  ctx.stroke();
}

function drawEffects() {
  for (const effect of effects) {
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = 1 - progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 18;

    if (effect.type === "beam") {
      ctx.lineWidth = effect.width * (1 - progress * 0.5);
      ctx.beginPath();
      ctx.moveTo(effect.startX, effect.startY);
      ctx.lineTo(effect.endX, effect.endY);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.32;
      ctx.lineWidth = effect.width * 5;
      ctx.stroke();
    } else if (effect.type === "explosion") {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.size * progress, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i += 1) {
        const angle = i * Math.PI / 4 + progress;
        const distance = effect.size * progress * randomBetween(0.65, 1);
        ctx.fillRect(effect.x + Math.cos(angle) * distance, effect.y + Math.sin(angle) * distance, 2, 2);
      }
    } else if (effect.type === "pulse") {
      ctx.lineWidth = 2 + (1 - progress) * 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.size * progress, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.08;
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPanel(x, y, panelWidth, panelHeight, title, accent = "#8cff82") {
  ctx.save();
  ctx.fillStyle = "rgba(3, 16, 10, 0.58)";
  ctx.strokeStyle = "rgba(132, 255, 118, 0.32)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 12, y);
  ctx.lineTo(x + panelWidth, y);
  ctx.lineTo(x + panelWidth, y + panelHeight - 10);
  ctx.lineTo(x + panelWidth - 12, y + panelHeight);
  ctx.lineTo(x, y + panelHeight);
  ctx.lineTo(x, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = `${Math.max(9, Math.min(13, width * 0.0085))}px "Courier New"`;
  ctx.textAlign = "left";
  ctx.fillText(title, x + 12, y + 20);
  drawLine(x + 12, y + 27, x + panelWidth - 12, y + 27, accent, 1, 0.35);
  ctx.restore();
}

function drawBar(x, y, barWidth, value, color, label) {
  ctx.fillStyle = "rgba(128, 255, 115, 0.12)";
  ctx.fillRect(x, y, barWidth, 6);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, barWidth * clamp(value / 100, 0, 1), 6);
  ctx.fillStyle = color;
  ctx.font = `${Math.max(8, Math.min(11, width * 0.007))}px "Courier New"`;
  ctx.textAlign = "left";
  ctx.fillText(label, x, y - 5);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(value)}%`, x + barWidth, y - 5);
}

function drawPanels() {
  const compact = width < 820;
  const panelWidth = compact ? 146 : clamp(width * 0.17, 190, 250);
  const top = height * 0.15;
  const left = compact ? 10 : width * 0.035;
  const right = width - panelWidth - (compact ? 10 : width * 0.035);
  const panelHeight = compact ? 120 : 170;
  const hudFont = Math.max(8, Math.min(12, width * 0.0078));
  const green = "#98ff8b";
  const warning = "#ff4938";

  drawPanel(left, top, panelWidth, panelHeight, "BIO STATUS");
  const barWidth = panelWidth - 24;
  drawBar(left + 12, top + 49, barWidth, 100, green, "VITAL COHERENCE");
  drawBar(left + 12, top + 78, barWidth, 98 - Math.min(18, state.missed * 2), green, "ARMOR STRUCTURE");
  drawBar(left + 12, top + 107, barWidth, Math.max(32, 94 - state.heat * 0.48), state.heat >= 80 ? warning : green, "NEURAL ADAPTATION");
  if (!compact) {
    ctx.strokeStyle = "rgba(151, 255, 137, 0.55)";
    ctx.beginPath();
    for (let i = 0; i < 35; i += 1) {
      const x = left + 12 + (i / 34) * barWidth;
      const y = top + 142 + Math.sin(i * 1.8 + elapsed * 4) * randomBetween(1, 5);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const strained = state.energy < 28 || state.heat >= 80;
  drawPanel(right, top, panelWidth, panelHeight + 18, "TETHER STATUS", strained ? warning : green);
  ctx.fillStyle = strained ? warning : green;
  ctx.font = `${hudFont}px "Courier New"`;
  ctx.textAlign = "left";
  const lines = [
    `LINK: ${strained ? "STRAINED" : "STABLE"}`,
    `POWER FLOW: ${Math.round(91 + state.energy * 0.08)}%`,
    "BIO-TETHER CONNECTED",
    "LUNA HUB 7-A",
  ];
  lines.forEach((line, index) => ctx.fillText(line, right + 12, top + 52 + index * 22));
  drawBar(right + 12, top + panelHeight - 6, barWidth, state.energy, state.energy < 25 ? warning : green, "TETHER ENERGY");

  const weaponWidth = clamp(width * 0.22, 210, 320);
  const weaponX = compact ? 10 : width * 0.045;
  const weaponY = height - (compact ? 157 : 190);
  drawPanel(weaponX, weaponY, weaponWidth, compact ? 118 : 148, "WEAPON SYSTEM");
  ctx.fillStyle = state.overheated ? warning : green;
  ctx.font = `${hudFont}px "Courier New"`;
  ctx.textAlign = "left";
  ctx.fillText("BIOTIC LANCE // INTERCEPT", weaponX + 12, weaponY + 52);
  drawBar(weaponX + 12, weaponY + 78, weaponWidth - 24, state.energy, state.energy < 25 ? warning : green, "CHARGE LEVEL");
  drawBar(weaponX + 12, weaponY + 107, weaponWidth - 24, state.heat, state.heat >= 80 ? warning : green, "WEAPON TEMP");
  if (!compact) {
    ctx.textAlign = "left";
    ctx.fillText(state.overheated ? "FIRE MODE: THERMAL LOCK" : "FIRE MODE: PRECISION / PULSE", weaponX + 12, weaponY + 132);
  }
}

function drawTargetingHud() {
  const green = state.overheated ? "#ff4b38" : "#9dff91";
  const zoom = state.zoomLevels[state.zoomIndex];
  const ringRadius = [92, 72, 54][state.zoomIndex] + Math.sin(elapsed * 2.3) * 2;
  const centerX = width / 2;
  const centerY = height * 0.45;
  const target = findTarget();

  ctx.save();
  ctx.strokeStyle = green;
  ctx.fillStyle = green;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.arc(state.aimX, state.aimY, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.32;
  ctx.beginPath();
  ctx.arc(state.aimX, state.aimY, ringRadius * 1.4, -0.35, 0.35);
  ctx.arc(state.aimX, state.aimY, ringRadius * 1.4, Math.PI - 0.35, Math.PI + 0.35);
  ctx.stroke();

  ctx.globalAlpha = 0.75;
  drawLine(state.aimX - 32, state.aimY, state.aimX - 8, state.aimY, green);
  drawLine(state.aimX + 8, state.aimY, state.aimX + 32, state.aimY, green);
  drawLine(state.aimX, state.aimY - 32, state.aimX, state.aimY - 8, green);
  drawLine(state.aimX, state.aimY + 8, state.aimX, state.aimY + 32, green);
  ctx.beginPath();
  ctx.arc(state.aimX, state.aimY, target ? 5 : 3, 0, Math.PI * 2);
  target ? ctx.fill() : ctx.stroke();

  ctx.globalAlpha = 0.28;
  drawLine(centerX - width * 0.16, centerY, centerX + width * 0.16, centerY, green);
  drawLine(centerX, centerY - height * 0.19, centerX, centerY + height * 0.19, green);

  ctx.globalAlpha = 0.85;
  ctx.textAlign = "center";
  ctx.font = `${Math.max(9, Math.min(13, width * 0.008))}px "Courier New"`;
  ctx.fillText(target ? "TARGET SOLUTION: VALID" : "SEEKING TARGET SOLUTION", state.aimX, state.aimY + ringRadius + 22);
  ctx.fillText(`ZOOM ${zoom}X // HIT CONE ${Math.round(CONFIG.hitRadius * [1, 1.12, 1.28][state.zoomIndex])}`, state.aimX, state.aimY + ringRadius + 38);
  ctx.restore();
}

function drawTopHud() {
  const green = "#a6ff98";
  const topWidth = clamp(width * 0.44, 360, 660);
  const left = (width - topWidth) / 2;
  ctx.fillStyle = "rgba(4, 18, 10, 0.62)";
  ctx.strokeStyle = "rgba(142, 255, 129, 0.38)";
  ctx.beginPath();
  ctx.moveTo(left, 0);
  ctx.lineTo(left + 28, 42);
  ctx.lineTo(left + topWidth - 28, 42);
  ctx.lineTo(left + topWidth, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = green;
  ctx.textAlign = "center";
  ctx.font = `${Math.max(10, Math.min(14, width * 0.009))}px "Courier New"`;
  ctx.fillText(`MISSION: INTERCEPT // WAVE ${state.wave}`, width / 2, 17);
  ctx.font = `${Math.max(8, Math.min(11, width * 0.0072))}px "Courier New"`;
  ctx.fillText(`SCORE ${String(state.score).padStart(6, "0")}  //  MISSED ${String(state.missed).padStart(2, "0")}  //  WAVE CLEAR ${state.waveIntercepts}/${CONFIG.waveTarget}`, width / 2, 33);
}

function drawHelmetFrame() {
  const frame = ctx.createRadialGradient(width / 2, height * 0.45, Math.min(width, height) * 0.3, width / 2, height * 0.48, Math.max(width, height) * 0.72);
  frame.addColorStop(0.52, "rgba(0,0,0,0)");
  frame.addColorStop(0.77, "rgba(0,4,2,0.32)");
  frame.addColorStop(1, "rgba(0,0,0,0.94)");
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(113, 160, 124, 0.24)";
  ctx.lineWidth = Math.max(3, width * 0.006);
  ctx.beginPath();
  ctx.moveTo(0, height * 0.16);
  ctx.quadraticCurveTo(width * 0.5, -height * 0.07, width, height * 0.16);
  ctx.moveTo(0, height * 0.84);
  ctx.quadraticCurveTo(width * 0.5, height * 1.07, width, height * 0.84);
  ctx.stroke();

  ctx.strokeStyle = "rgba(142, 255, 129, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const inset = 12 + i * 14;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  }
}

function drawScanEffect() {
  if (state.scan <= 0) return;
  const progress = 1 - state.scan;
  const radius = progress * Math.hypot(width, height) * 0.6;
  ctx.save();
  ctx.strokeStyle = `rgba(133, 255, 124, ${state.scan * 0.65})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = "#7dff7f";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(state.aimX, state.aimY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWarnings() {
  const compromised = state.missed >= CONFIG.maxMissedBeforeCompromised;
  const warning = state.overheated || state.heat >= 80 || compromised;
  if (warning) {
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(elapsed * 8) * 0.2;
    ctx.fillStyle = "#ff4938";
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.max(14, Math.min(22, width * 0.014))}px "Courier New"`;
    const message = compromised
      ? "DEFENSE LINE COMPROMISED"
      : state.overheated
        ? "WEAPON TEMP CRITICAL // THERMAL LOCK"
        : "OVERLOAD RISK // REDUCE FIRE RATE";
    ctx.fillText(message, width / 2, height * 0.12);
    ctx.restore();
  }

  if (state.statusTimer > 0) {
    ctx.fillStyle = state.blockedFlash > 0 ? "#ff5440" : "#b9ffad";
    ctx.textAlign = "center";
    ctx.font = `${Math.max(9, Math.min(12, width * 0.008))}px "Courier New"`;
    ctx.fillText(state.statusMessage, width / 2, height - 18);
  }

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(${state.overheated ? "255, 38, 24" : "176, 255, 175"}, ${state.flash * 0.08})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (state.blockedFlash > 0) {
    ctx.strokeStyle = `rgba(255, 55, 42, ${state.blockedFlash * 0.6})`;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, width - 12, height - 12);
  }
}

function draw() {
  ctx.save();
  if (state.shake > 0) {
    ctx.translate(randomBetween(-state.shake, state.shake), randomBetween(-state.shake, state.shake));
  }
  drawBackground();
  drawEarth();
  drawMoonSurface();
  drawWeapon();
  drawEnemies();
  drawEffects();
  drawScanEffect();
  drawPanels();
  drawTargetingHud();
  drawTopHud();
  drawHelmetFrame();
  drawWarnings();
  ctx.restore();
}

function gameLoop(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(delta);
  draw();
  requestAnimationFrame(gameLoop);
}

function updateAimFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const centerX = width / 2;
  const centerY = height * 0.45;
  const sensitivity = [1, 0.6, 0.34][state.zoomIndex];
  state.targetAimX = clamp(centerX + (pointerX - centerX) * sensitivity, width * 0.12, width * 0.88);
  state.targetAimY = clamp(centerY + (pointerY - centerY) * sensitivity, height * 0.1, height * 0.72);
}

canvas.addEventListener("pointermove", updateAimFromPointer);
canvas.addEventListener("pointerdown", (event) => {
  if (event.button === 0) firePrimary();
  if (event.button === 2) cycleZoom(1);
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  cycleZoom(event.deltaY > 0 ? 1 : -1);
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    firePulse();
  } else if (event.key.toLowerCase() === "r") {
    resetSimulation();
  } else if (event.key.toLowerCase() === "t") {
    triggerScan();
  }
});

startButton.addEventListener("click", () => {
  started = true;
  startCard.classList.add("hidden");
  resetSimulation();
  setStatus("NEURAL LINK ACTIVE // INTERCEPT AUTHORIZED", 3);
});

resetButton.addEventListener("click", () => {
  started = true;
  startCard.classList.add("hidden");
  resetSimulation();
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
requestAnimationFrame(gameLoop);
