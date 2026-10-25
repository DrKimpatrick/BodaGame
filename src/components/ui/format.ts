export function fmtUgx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`
}
