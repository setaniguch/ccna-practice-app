/**
 * questions.json 内の画像パス
 *   例: "/assets/media/exam-media/04300/0000200001.png"
 * を、public/images/ 直下に配置したファイル名ベースの URL に変換する。
 */
export function resolveImageUrl(path: string): string {
  const fileName = path.split('/').pop();
  if (!fileName) return path;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/images/${fileName}`;
}
