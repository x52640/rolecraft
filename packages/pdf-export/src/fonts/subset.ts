/**
 * 依履歷實際文字裁字型（ADR-0005 B4）。用 HarfBuzz hb-subset（subset-font，WebAssembly）。
 * 裁掉沒用到的碼位也修掉 Chrome 把「小」寫成康熙部首「⼩」的問題：
 * 完整字型的 cmap 把 U+5C0F 與 U+2F29 指向同一字形，Chrome 反查時會選錯；裁切後 cmap 只剩用到的碼位。
 */
import subsetFont from 'subset-font';

export async function subsetForText(fontBytes: Uint8Array, text: string): Promise<Uint8Array> {
  const out = await subsetFont(Buffer.from(fontBytes), text, { targetFormat: 'sfnt' });
  return new Uint8Array(out);
}
