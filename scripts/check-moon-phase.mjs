import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const require = createRequire(new URL('../technical/package.json', import.meta.url));
const ts = require('typescript');
const source = await readFile(new URL('../technical/moon-phase.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
  reportDiagnostics: true,
});
const failures = (compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
assert.equal(failures.length, 0, failures.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
const {phaseAt, phaseKind, phasePath} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const GRID = 400, AREA_TOLERANCE = 0.004, SVG_TOLERANCE = 0.00002;
const report = {
  generatedAt: new Date().toISOString(), status: 'running',
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  scope: '平行光、理想球体、正交投影几何；不是实测光度、真实星历或学习效果验收',
  methods: ['逐像素重建可见球面法线，以 n·(+z)>0 判断受照', 'SVG 半椭圆边界离散后作多边形面积与质心积分'],
  parameters: {grid: GRID, areaTolerance: AREA_TOLERANCE, svgTolerance: SVG_TOLERANCE, arcSegments: 512},
  checks: [], samples: [], svgSamples: [],
};
const close = (actual, expected, tolerance, context) => assert.ok(Math.abs(actual - expected) <= tolerance, `${context}: ${actual} ≠ ${expected} (容差 ${tolerance})`);

// -- 独立参考：相机基向量由输入角构造，不读取待测函数的 observer/fraction --------
function sampledDisk(degrees, radius = 1) {
  const theta = degrees * Math.PI / 180;
  const observer = [Math.sin(theta), 0, Math.cos(theta)];
  // up × observer 得到相机右向；屏幕 y 反向不影响 +z 入射光判断。
  const right = [observer[2], 0, -observer[0]];
  let visible = 0, lit = 0, momentX = 0;
  for (let row = 0; row < GRID; row++) {
    const y = ((row + 0.5) / GRID * 2 - 1) * radius;
    for (let col = 0; col < GRID; col++) {
      const x = ((col + 0.5) / GRID * 2 - 1) * radius;
      const zSquared = radius * radius - x * x - y * y;
      if (zSquared <= 0) continue;
      visible++;
      const z = Math.sqrt(zSquared);
      const normalZ = (x * right[2] + z * observer[2]) / radius;
      if (normalZ > 0) {lit++; momentX += x / radius;}
    }
  }
  return {fraction: lit / visible, centroidX: lit ? momentX / lit : null, visible, lit};
}

// -- 仅解析本模块契约中的 M/L/A/Z 与原点同心半椭圆，不充当通用 SVG 解释器 --------
function pathPolygon(path) {
  if (!path) return [];
  const tokens = path.match(/[MLAZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const points = [];
  let index = 0, current = [0, 0];
  const number = () => {const value = Number(tokens[index++]); assert.ok(Number.isFinite(value)); return value;};
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'M' || command === 'L') {
      current = [number(), number()]; points.push(current);
    } else if (command === 'A') {
      const rx = number(), ry = number(), rotation = number(), large = number(), sweep = number();
      const end = [number(), number()];
      assert.ok(rx > 0 && ry > 0); assert.equal(rotation, 0); assert.equal(large, 0);
      assert.ok(sweep === 0 || sweep === 1); assert.equal(current[0], 0); assert.equal(end[0], 0);
      close(Math.abs(current[1]), ry, ry * 1e-12, '半椭圆起点');
      close(end[1], -current[1], ry * 1e-12, '半椭圆终点');
      const startAngle = Math.atan2(current[1] / ry, current[0] / rx);
      for (let step = 1; step <= 512; step++) {
        const t = startAngle + (sweep ? 1 : -1) * Math.PI * step / 512;
        points.push([rx * Math.cos(t), ry * Math.sin(t)]);
      }
      current = end;
    } else assert.equal(command, 'Z', `未知轮廓命令 ${command}`);
  }
  return points;
}

function polygonMeasure(points, radius) {
  if (!points.length) return {fraction: 0, centroidX: null};
  let twiceArea = 0, moment = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    twiceArea += cross; moment += (a[0] + b[0]) * cross;
  }
  return {fraction: Math.abs(twiceArea) / (2 * Math.PI * radius * radius), centroidX: twiceArea ? moment / (3 * twiceArea * radius) : null};
}

try {
  for (const [angle, expected] of [[0, 1], [90, 0.5], [180, 0], [270, 0.5], [360, 1]]) {
    close(phaseAt(angle).fraction, expected, 1e-14, `基准 ${angle}°`);
  }
  for (let angle = 0; angle < 360; angle += 15) {
    const actual = phaseAt(angle), reference = sampledDisk(angle);
    close(actual.fraction, reference.fraction, AREA_TOLERANCE, `${angle}° 圆盘采样`);
    close(Math.hypot(...actual.observer), 1, 1e-14, '观察向量单位长度');
    close(actual.observer[0], Math.sin(angle * Math.PI / 180), 1e-14, '观察位置 x');
    close(actual.observer[2], Math.cos(angle * Math.PI / 180), 1e-14, '观察位置 z');
    const expectedSide = angle === 0 || angle === 180 ? 'none' : reference.centroidX < 0 ? 'left' : 'right';
    assert.equal(actual.brightSide, expectedSide, `${angle}° 亮边方向`);
    if (expectedSide !== 'none') assert.ok(Math.abs(reference.centroidX) > 0.001);
    report.samples.push({angle, fraction: actual.fraction, sampledFraction: reference.fraction, centroidX: reference.centroidX, brightSide: actual.brightSide});
    for (const radius of [1, 40, 1000]) {
      const svg = polygonMeasure(pathPolygon(phasePath(angle, radius)), radius);
      close(svg.fraction, reference.fraction, AREA_TOLERANCE, `${angle}° SVG 与独立采样`);
      close(svg.fraction, actual.fraction, SVG_TOLERANCE, `${angle}° SVG 积分`);
      if (expectedSide !== 'none') assert.equal(Math.sign(svg.centroidX), Math.sign(reference.centroidX), `${angle}° SVG 亮边`);
      report.svgSamples.push({angle, radius, ...svg});
    }
  }
  report.checks.push('24 个全圈角度的独立圆盘采样；亮边质心与 SVG 边界积分一致');

  for (const angle of [37, 90, 123, 237, 270, 323]) {
    const baseline = sampledDisk(angle);
    for (const radius of [0.01, 40, 1000]) {
      const scaled = sampledDisk(angle, radius);
      close(scaled.fraction, baseline.fraction, 1 / baseline.visible, '球体半径改变后的面积比例');
      close(scaled.centroidX, baseline.centroidX, 1e-10, '球体半径改变后的归一化质心');
    }
  }
  report.checks.push('跨数量级球体半径的独立采样比例与归一化质心保持不变');

  for (const angle of [-720, -360, -270, -45, 0, 45, 90, 180, 315, 360, 720, 1080]) {
    const actual = phaseAt(angle), wrapped = phaseAt(angle + 360);
    assert.deepEqual(actual, wrapped, '有限角度按整圈等价');
    assert.ok(actual.phaseAngle >= 0 && actual.phaseAngle <= 180);
  }
  for (const boundary of [0, 180, 360]) {
    const a = phaseAt(boundary - 1e-5), b = phaseAt(boundary + 1e-5);
    close(a.fraction, b.fraction, 1e-12, '跨端点面积连续');
    assert.ok(Math.hypot(...a.observer.map((v, i) => v - b.observer[i])) < 1e-6, '跨端点观察位置连续');
  }
  for (const [angle, kind] of [[60, 'gibbous'], [90, 'half'], [120, 'crescent'], [240, 'crescent'], [270, 'half'], [300, 'gibbous'], [0, null], [180, null], [360, null]]) {
    assert.equal(phaseKind(angle), kind, '预测分类与新满端点');
  }
  for (const invalid of [NaN, Infinity, -Infinity]) {
    for (const calculate of [phaseAt, phaseKind, phasePath]) assert.throws(() => calculate(invalid), RangeError);
  }
  for (const finite of [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE]) {
    const actual = phaseAt(finite);
    assert.ok(actual.observer.every(Number.isFinite));
    assert.ok(actual.fraction >= 0 && actual.fraction <= 1);
    assert.ok(actual.phaseAngle >= 0 && actual.phaseAngle <= 180);
  }
  for (const invalid of [0, -1, NaN, Infinity, -Infinity]) assert.throws(() => phasePath(90, invalid), RangeError);
  assert.equal(phasePath(180), ''); assert.ok(phasePath(0).endsWith('Z'));
  report.checks.push('角度归一化、360° 连续性、新满端点、三档预测与有限值／半径守卫');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = {name: error.name, message: error.message, stack: error.stack};
  process.exitCode = 1;
}
const outputDirectory = new URL('../technical/evidence/', import.meta.url);
await mkdir(outputDirectory, {recursive: true});
await writeFile(new URL('moon-phase-science.json', outputDirectory), JSON.stringify(report, null, 2) + '\n');
console.log(`月相几何验算：${report.status}；报告 technical/evidence/moon-phase-science.json`);
if (report.error) console.error(report.error.message);
