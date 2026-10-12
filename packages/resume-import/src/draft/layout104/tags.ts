/** 104 的 `#標籤` 小字行；換行時下一行（小字、不以 # 開頭）接回最後一個標籤（P1-T066）。 */
import type { DraftField } from '../../types.ts';
import { fieldAt, isSmall, joinWrapped, type Located, tagsIn } from './lines.ts';

export class TagCollector {
  private readonly collected: DraftField[] = [];
  private active = false;

  /** 這行是標籤行（或標籤行的續行）就收下並回傳 true。 */
  take(at: Located): boolean {
    const { line } = at;
    const text = line.text.trim();
    if (isSmall(line) && text.startsWith('#')) {
      this.collected.push(...tagsIn(text).map((tag) => fieldAt(tag, at)));
      this.active = true;
      return true;
    }
    const last = this.collected.at(-1);
    if (this.active && last && isSmall(line) && text !== '') {
      last.value = joinWrapped(last.value, text.replace(/\t+/gu, ' '));
      return true;
    }
    this.active = false;
    return false;
  }

  end(): void {
    this.active = false;
  }

  fields(): DraftField[] {
    return this.collected;
  }
}
