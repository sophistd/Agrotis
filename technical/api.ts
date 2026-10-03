import {position, sourceDirection, epoch, state} from './model';
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {method: body ? 'POST' : 'GET',
    headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(path==='/observations/refresh'?26000:path.endsWith('/refresh') ? 16000 : 7000)});
  if (!response.ok) throw new Error(`查询失败（${response.status}）`);
  return response.json() as Promise<T>;
}
export function checkGeometry() {
  return request<{satellites: {index: number; earth_occulted: boolean; relative_arrival_ms: number}[]}>('/analyses/geometry', {
    at: new Date(epoch + state.seconds * 1000).toISOString(), positions_km: [position(0), position(1)],
    source_direction: sourceDirection(), coordinate_frame: 'ITRS', model_version: 'teaching-geometry/1',
  });
}
