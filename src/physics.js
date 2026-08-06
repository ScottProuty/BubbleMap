// The force-directed layout simulation: repulsion between bubbles, spring pulls
// along parent/child links, and a scheduler that stops running frames once
// everything has settled (to save CPU) and wakes back up on interaction.

import { state, physicsParams } from './state.js';
import { bubbleRadius, positionEl } from './utils.js';
import { rebuildLinksSVG } from './linking.js';

const LINK_SPRING = 0.02; // Strength of the pull keeping linked bubbles at LINK_DISTANCE
const LINK_DOWN_BIAS = 0.3; // Gentle nudge that makes children prefer settling below their parent
const INTERSECT_PUSH = 6; // Repelling force when two bubbles intersect
const MASS_PER_CHILD = 1; // Extra resistance to movement added per child a bubble has

// Once bubbles have settled (little to no movement for a while), stop scheduling
// physics frames entirely to save CPU. Any interaction that could require bubbles
// to move again (create, link, delete, select, drag) calls wakePhysics() to resume.
const QUIET_THRESHOLD_FRAMES = 50;
const QUIET_MOVEMENT_EPSILON = 1.7;

function stepPhysics(dt) {
  const list = Array.from(state.bubbles.values());
  const forces = new Map(list.map((b) => [b.id, { fx: 0, fy: 0 }]));

  const addForce = (id, fx, fy) => {
    const f = forces.get(id);
    f.fx += fx;
    f.fy += fy;
  };

  // Repulsion between unrelated bubbles, and a strong push apart for any bubbles
  // that visually intersect (regardless of link status). Computed once per pair
  // and applied symmetrically to both sides.
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const o = list[j];
      const dx = o.x - b.x, dy = o.y - b.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 0.01) dist = 0.01;

      const combinedRadius = bubbleRadius(b) + bubbleRadius(o);
      const overlap = combinedRadius - dist;
      if (overlap > 0) {
        const strength = (overlap / combinedRadius) * INTERSECT_PUSH;
        const fx = (dx / dist) * strength, fy = (dy / dist) * strength;
        addForce(b.id, -fx, -fy);
        addForce(o.id, fx, fy);
        continue;
      }

      const linked = b.parents.includes(o.id) || o.parents.includes(b.id);
      if (linked) continue;
      if (dist < physicsParams.REPEL_FORCE) {
        const strength = ((physicsParams.REPEL_FORCE - dist) / physicsParams.REPEL_FORCE) * 1.2;
        const fx = (dx / dist) * strength, fy = (dy / dist) * strength;
        addForce(b.id, -fx, -fy);
        addForce(o.id, fx, fy);
      }
    }
  }

  // Parent/child link: a single spring keeping them LINK_DISTANCE apart, with a
  // gentle bias so the child prefers settling below its parent. Applied equally
  // and oppositely to both ends, so a crowded parent gets pulled back toward its
  // children instead of only ever being pushed away by them.
  const childCounts = new Map(list.map((b) => [b.id, 0]));
  for (const child of list) {
    for (const pid of child.parents) {
      const parent = state.bubbles.get(pid);
      if (!parent) continue;
      childCounts.set(pid, (childCounts.get(pid) || 0) + 1);

      const dx = child.x - parent.x, dy = child.y - parent.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const diff = dist - physicsParams.LINK_DISTANCE;
      const downBias = child.done ? -LINK_DOWN_BIAS : LINK_DOWN_BIAS;
      const fx = -(dx / dist) * diff * LINK_SPRING;
      const fy = -(dy / dist) * diff * LINK_SPRING + downBias;

      addForce(child.id, fx, fy);
      addForce(parent.id, -fx, -fy);
    }
  }

  // Bubbles stranded far from everything else drift back toward their nearest neighbor.
  for (const b of list) {
    let nearestDist = Infinity, nearest = null;
    for (const o of list) {
      if (o === b) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d < nearestDist) { nearestDist = d; nearest = o; }
    }
    if (nearest && nearestDist > physicsParams.MAX_DISTANCE) {
      const dx = nearest.x - b.x, dy = nearest.y - b.y;
      const d = nearestDist || 0.01;
      const excess = nearestDist - physicsParams.MAX_DISTANCE;
      addForce(b.id, (dx / d) * excess * 0.02, (dy / d) * excess * 0.02);
    }
  }

  for (const b of list) {
    if (b.selected || b === state.draggingBubble) { b.vx = 0; b.vy = 0; continue; }
    const { fx, fy } = forces.get(b.id);
    const mass = 1 + (childCounts.get(b.id) || 0) * MASS_PER_CHILD;

    b.vx = (b.vx + (fx / mass) * dt) * 0.82;
    b.vy = (b.vy + (fy / mass) * dt) * 0.82;
    const forceMag = Math.hypot(fx, fy) / mass;
    const maxSpeed = Math.min(40, 6 + forceMag * 1.5);
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > maxSpeed) {
      b.vx = (b.vx / speed) * maxSpeed;
      b.vy = (b.vy / speed) * maxSpeed;
    }
  }

  let totalMovement = 0;
  for (const b of list) {
    if (b.selected || b === state.draggingBubble) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    positionEl(b);
    totalMovement += Math.hypot(b.vx, b.vy);
  }
  return totalMovement;
}

// While a dragged bubble is hovering over a valid drop target, physics is paused so
// the highlighted target doesn't drift or get repelled away before the user can
// release the mouse to link. pauseDragPhysics()/wakePhysics() toggle this.
export function pauseDragPhysics() {
  state.physicsPaused = true;
}

export function wakePhysics() {
  state.quietFrames = 0;
  const wasStopped = state.physicsAsleep || state.physicsPaused;
  state.physicsAsleep = false;
  state.physicsPaused = false;
  if (wasStopped) {
    state.lastTime = null;
    requestAnimationFrame(tick);
  }
}

export function tick(now) {
  if (state.physicsPaused) return;
  if (state.lastTime == null) state.lastTime = now;
  let dt = (now - state.lastTime) / 16.6667;
  dt = Math.min(dt, 3);
  state.lastTime = now;

  const totalMovement = stepPhysics(dt);
  rebuildLinksSVG();

  if (state.draggingBubble || totalMovement >= QUIET_MOVEMENT_EPSILON) {
    state.quietFrames = 0;
  } else {
    state.quietFrames++;
  }

  if (state.quietFrames > QUIET_THRESHOLD_FRAMES) {
    state.physicsAsleep = true;
    return;
  }

  requestAnimationFrame(tick);
}
