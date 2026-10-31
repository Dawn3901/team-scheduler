/** 按 Unicode 码点计数，和 Python 后端的 len() 保持一致。 */
export function countChars(value: string): number {
  return Array.from(value).length;
}
