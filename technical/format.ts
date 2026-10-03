export const escape = (value: string | number) => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]!));
export function utcStamp(value: string | number) {const date = new Date(value); return Number.isNaN(date.getTime()) ? '未知' : date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';}
