// Path-carved winding tunnels. Tunnel origins live on a world REGION grid
// (larger than a chunk); to carve a chunk we query every region whose tunnels
// could reach it, so a tunnel starting in a neighbouring region still carves
// in — seamless across chunk borders, independent of generation order.
//
// Determinism: a region's tunnels derive purely from its integer coords + the
// tunnel sub-seed. Region segments are memoized (a pure cache; never affects
// output). Branching is bounded via an explicit queue, never open recursion.

import type { Box3, Voxel } from './types.ts';
import type { CaveConfig } from './config.ts';
import { canCarve } from './config.ts';
import { hash3i, mix, mulberry32 } from './seed.ts';
import { floorDiv } from './coords.ts';
import type { VoxelChunk } from './chunk.ts';

export interface TunnelSegment {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  rStart: number;
  rEnd: number;
  box: Box3;
}

interface Carver {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  length: number;
  radius: number;
  depth: number;
  seed: number;
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const m = Math.hypot(x, y, z) || 1;
  return [x / m, y / m, z / m];
}

export class TunnelCarver {
  private readonly cache = new Map<string, TunnelSegment[]>();
  private readonly reach: number;

  constructor(
    private readonly config: CaveConfig,
    private readonly seed: number,
  ) {
    // How many regions out a tunnel could reach into this chunk.
    this.reach = Math.ceil((config.maxTunnelLength + config.maxTunnelRadius) / config.tunnelRegionSize) + 1;
  }

  /** Segments of every tunnel (and branch) originating in a region. Memoized. */
  segmentsForRegion(rcx: number, rcy: number, rcz: number): TunnelSegment[] {
    const key = `${rcx},${rcy},${rcz}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const segs = this.generateRegion(rcx, rcy, rcz);
    this.cache.set(key, segs);
    return segs;
  }

  private generateRegion(rcx: number, rcy: number, rcz: number): TunnelSegment[] {
    const c = this.config;
    const regionSeed = hash3i(rcx, rcy, rcz, this.seed);
    const rand = mulberry32(regionSeed);
    if (rand() >= c.tunnelSpawnChance) return [];

    const size = c.tunnelRegionSize;
    const ox = rcx * size + rand() * size;
    let oy = rcy * size + rand() * size;
    const oz = rcz * size + rand() * size;
    oy = Math.max(c.minCaveY + 2, Math.min(c.maxCaveY - 2, oy));

    // Primary direction (biased horizontal), primary tunnel.
    const [dx, dy, dz] = normalize(rand() * 2 - 1, (rand() * 2 - 1) * 0.4 + c.verticalBias, rand() * 2 - 1);
    const segments: TunnelSegment[] = [];
    const queue: Carver[] = [
      {
        x: ox,
        y: oy,
        z: oz,
        dx,
        dy,
        dz,
        length: c.minTunnelLength + rand() * (c.maxTunnelLength - c.minTunnelLength),
        radius: c.minTunnelRadius + rand() * (c.maxTunnelRadius - c.minTunnelRadius),
        depth: 0,
        seed: mix(regionSeed, 0x9e3779b9),
      },
    ];

    let branchBudget = c.maxBranches;
    while (queue.length) {
      const carver = queue.shift()!;
      branchBudget = this.carvePath(carver, segments, queue, branchBudget);
    }
    return segments;
  }

  /** Walk a single carver's path, emitting segments and (bounded) branches.
   *  Returns the remaining branch budget. */
  private carvePath(carver: Carver, out: TunnelSegment[], queue: Carver[], branchBudget: number): number {
    const c = this.config;
    const rand = mulberry32(carver.seed);
    const steps = Math.max(2, Math.round(carver.length / c.tunnelStepLength));
    let px = carver.x;
    let py = carver.y;
    let pz = carver.z;
    let [dx, dy, dz] = normalize(carver.dx, carver.dy, carver.dz);
    let radius = carver.radius;
    let prevX = px;
    let prevY = py;
    let prevZ = pz;
    let prevR = radius;

    for (let s = 1; s < steps; s++) {
      // Gradually steer (seeded), keep vertical slope bounded, renormalize.
      dx += (rand() * 2 - 1) * c.directionJitter;
      dy += (rand() * 2 - 1) * c.directionJitter + c.verticalBias * 0.2;
      dz += (rand() * 2 - 1) * c.directionJitter;
      [dx, dy, dz] = normalize(dx, dy, dz);
      if (Math.abs(dy) > c.maxTunnelSlope) dy = Math.sign(dy) * c.maxTunnelSlope;
      [dx, dy, dz] = normalize(dx, dy, dz);

      px += dx * c.tunnelStepLength;
      py += dy * c.tunnelStepLength;
      pz += dz * c.tunnelStepLength;
      if (py < c.minCaveY || py > c.maxCaveY) break;

      // Wander the radius smoothly within bounds.
      radius += (rand() * 2 - 1) * 0.5;
      radius = Math.max(c.minTunnelRadius, Math.min(c.maxTunnelRadius, radius));

      out.push(makeSegment(prevX, prevY, prevZ, px, py, pz, prevR, radius, c.tunnelVerticalScale));
      prevX = px;
      prevY = py;
      prevZ = pz;
      prevR = radius;

      // Spawn a bounded branch.
      if (
        branchBudget > 0 &&
        carver.depth < c.maxBranchDepth &&
        s > steps * 0.2 &&
        rand() < c.branchChance
      ) {
        branchBudget--;
        const bAngle = (rand() * 2 - 1) * 1.2;
        const cos = Math.cos(bAngle);
        const sin = Math.sin(bAngle);
        const [nx, , nz] = normalize(dx * cos - dz * sin, dy, dx * sin + dz * cos);
        queue.push({
          x: px,
          y: py,
          z: pz,
          dx: nx,
          dy: dy,
          dz: nz,
          length: carver.length * c.branchLengthScale,
          radius: radius * c.branchRadiusScale,
          depth: carver.depth + 1,
          seed: mix(carver.seed, s * 0x85ebca6b),
        });
      }
    }
    return branchBudget;
  }

  /** Chunk-independent test: is this world voxel inside any tunnel? Used to
   *  prove border seamlessness (both neighbouring chunks agree with this). */
  isCaveAt(wx: number, wy: number, wz: number): boolean {
    const size = this.config.tunnelRegionSize;
    const rx0 = floorDiv(wx, size) - this.reach;
    const rx1 = floorDiv(wx, size) + this.reach;
    const ry0 = floorDiv(wy, size) - this.reach;
    const ry1 = floorDiv(wy, size) + this.reach;
    const rz0 = floorDiv(wz, size) - this.reach;
    const rz1 = floorDiv(wz, size) + this.reach;
    for (let rz = rz0; rz <= rz1; rz++) {
      for (let ry = ry0; ry <= ry1; ry++) {
        for (let rx = rx0; rx <= rx1; rx++) {
          const segs = this.segmentsForRegion(rx, ry, rz);
          for (let i = 0; i < segs.length; i++) {
            if (segmentContains(segs[i], wx, wy, wz, this.config.tunnelVerticalScale)) return true;
          }
        }
      }
    }
    return false;
  }

  /** Carve every tunnel segment overlapping the chunk into cave-air. */
  carveChunk(chunk: VoxelChunk): void {
    const c = this.config;
    const size = c.tunnelRegionSize;
    const ox = chunk.origin.x;
    const oy = chunk.origin.y;
    const oz = chunk.origin.z;
    const box: Box3 = {
      minX: ox,
      minY: oy,
      minZ: oz,
      maxX: ox + chunk.sizeX,
      maxY: oy + chunk.sizeY,
      maxZ: oz + chunk.sizeZ,
    };
    const r0x = floorDiv(ox, size) - this.reach;
    const r1x = floorDiv(ox + chunk.sizeX, size) + this.reach;
    const r0y = floorDiv(oy, size) - this.reach;
    const r1y = floorDiv(oy + chunk.sizeY, size) + this.reach;
    const r0z = floorDiv(oz, size) - this.reach;
    const r1z = floorDiv(oz + chunk.sizeZ, size) + this.reach;

    for (let rz = r0z; rz <= r1z; rz++) {
      for (let ry = r0y; ry <= r1y; ry++) {
        for (let rx = r0x; rx <= r1x; rx++) {
          const segs = this.segmentsForRegion(rx, ry, rz);
          for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            if (!boxesOverlap(seg.box, box)) continue;
            this.carveSegment(chunk, seg, box);
          }
        }
      }
    }
  }

  private carveSegment(chunk: VoxelChunk, seg: TunnelSegment, chunkBox: Box3): void {
    const c = this.config;
    // Clamp to the overlap of the segment box and the chunk (world coords).
    const minX = Math.max(Math.floor(seg.box.minX), chunkBox.minX);
    const minY = Math.max(Math.floor(seg.box.minY), chunkBox.minY);
    const minZ = Math.max(Math.floor(seg.box.minZ), chunkBox.minZ);
    const maxX = Math.min(Math.ceil(seg.box.maxX), chunkBox.maxX - 1);
    const maxY = Math.min(Math.ceil(seg.box.maxY), chunkBox.maxY - 1);
    const maxZ = Math.min(Math.ceil(seg.box.maxZ), chunkBox.maxZ - 1);
    const vScale = c.tunnelVerticalScale;

    for (let wy = minY; wy <= maxY; wy++) {
      const ly = wy - chunk.origin.y;
      for (let wz = minZ; wz <= maxZ; wz++) {
        const lz = wz - chunk.origin.z;
        for (let wx = minX; wx <= maxX; wx++) {
          if (!segmentContains(seg, wx, wy, wz, vScale)) continue;
          const lx = wx - chunk.origin.x;
          const block: Voxel = chunk.get(lx, ly, lz);
          if (canCarve(c, block)) chunk.set(lx, ly, lz, c.airBlock);
        }
      }
    }
  }
}

/** Is the world point inside the segment's elliptical capsule? */
function segmentContains(seg: TunnelSegment, wx: number, wy: number, wz: number, vScale: number): boolean {
  const abx = seg.bx - seg.ax;
  const aby = seg.by - seg.ay;
  const abz = seg.bz - seg.az;
  const abLen2 = abx * abx + aby * aby + abz * abz || 1;
  let t = ((wx - seg.ax) * abx + (wy - seg.ay) * aby + (wz - seg.az) * abz) / abLen2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = seg.ax + t * abx;
  const cy = seg.ay + t * aby;
  const cz = seg.az + t * abz;
  const r = seg.rStart + t * (seg.rEnd - seg.rStart);
  const rh2 = r * r;
  const rv = r * vScale;
  const rv2 = rv * rv;
  const dh2 = (wx - cx) * (wx - cx) + (wz - cz) * (wz - cz);
  const dvy = wy - cy;
  return dh2 / rh2 + (dvy * dvy) / rv2 <= 1;
}

function makeSegment(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  rStart: number,
  rEnd: number,
  vScale: number,
): TunnelSegment {
  const r = Math.max(rStart, rEnd);
  const rv = r * vScale;
  return {
    ax,
    ay,
    az,
    bx,
    by,
    bz,
    rStart,
    rEnd,
    box: {
      minX: Math.min(ax, bx) - r,
      minY: Math.min(ay, by) - rv,
      minZ: Math.min(az, bz) - r,
      maxX: Math.max(ax, bx) + r,
      maxY: Math.max(ay, by) + rv,
      maxZ: Math.max(az, bz) + r,
    },
  };
}

function boxesOverlap(a: Box3, b: Box3): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}
