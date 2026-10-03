export type PhaseKind = 'crescent' | 'half' | 'gibbous';
export interface PhaseGeometry {
  observer: [number, number, number];
  /** 可见圆盘中受照区域的面积比例，不是亮度或总反射通量。 */
  fraction: number;
  /** 球心处光源与观察者方向的夹角，单位为度，范围 [0, 180]。 */
  phaseAngle: number;
  /** 画面中的亮边方向；新月和满月没有单独的一侧亮边。 */
  brightSide: 'left' | 'right' | 'none';
}

function normalizedAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new RangeError('观察角必须是有限数值（度）');
  // -- 先取余再修正负数，避免正小角加 360 时损失有效位 --------
  const remainder = degrees % 360;
  return remainder < 0 ? (remainder + 360) % 360 : remainder === 0 ? 0 : remainder;
}

export function phaseAt(degrees: number): PhaseGeometry {
  const angle = normalizedAngle(degrees), radians = angle * Math.PI / 180;
  const sine = Math.sin(radians), cosine = Math.cos(radians);
  return {
    observer: [sine, 0, cosine],
    fraction: (1 + cosine) / 2,
    phaseAngle: angle <= 180 ? angle : 360 - angle,
    // -- 相机右向是 (cosθ, 0, -sinθ)，光源在其上的投影为 -sinθ --------
    brightSide: angle === 0 || angle === 180 ? 'none' : angle < 180 ? 'left' : 'right',
  };
}

export function phaseKind(degrees: number): PhaseKind | null {
  const {phaseAngle} = phaseAt(degrees);
  if (phaseAngle === 0 || phaseAngle === 180) return null;
  if (Math.abs(phaseAngle - 90) < 1e-10) return 'half';
  return phaseAngle > 90 ? 'crescent' : 'gibbous';
}

/** 原点为圆盘中心，SVG 的 +x 向右、+y 向下；新月返回空路径。 */
export function phasePath(degrees: number, radius = 40): string {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('圆盘半径必须是有限正数');
  const phase = phaseAt(degrees), r = radius;
  if (phase.fraction === 0) return '';
  if (phase.fraction === 1) return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${r} ${r} 0 0 1 0 ${-r} Z`;
  const side = phase.brightSide === 'right' ? 1 : -1;
  const cosine = phase.observer[2], limbSweep = side === 1 ? 1 : 0;
  const limb = `M 0 ${-r} A ${r} ${r} 0 0 ${limbSweep} 0 ${r}`;
  if (Math.abs(phase.phaseAngle - 90) < 1e-10) return `${limb} L 0 ${-r} Z`;
  // -- 明暗交界投影为半椭圆；从下向上返回时依据实际亮边选择弧向 --------
  const terminatorSweep = -side * cosine > 0 ? 0 : 1;
  return `${limb} A ${Math.abs(cosine) * r} ${r} 0 0 ${terminatorSweep} 0 ${-r} Z`;
}
