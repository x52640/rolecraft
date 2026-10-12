// 網頁來源 AI 整理的輸入（P1-T080；resume-import「網頁來源的 AI 整理」W6）。四個姓名來源：
// (1) 姓名元素文字 nameText：cleanHeaderName 切出的姓名，加上 headerNameAlias 切出的英文名（附註 1）；
// (2) 標籤為姓名的區塊值：由 pipeline 從區塊找；(3) 資料區既有 Profile 的姓名；(4) 請求帶來的使用者確認姓名。
// 既有 Profile 的聯絡資料值也加入遮蔽。網址不放進輸入（只留 helper 本機）。
import type { ImportWebCaptureResult, Profile } from '@rolecraft/contracts';
import { isPersonalLabel, type WebResumeParseInputs } from '@rolecraft/pipeline';
import { cleanHeaderName, headerNameAlias } from '@rolecraft/resume-import';

import type { WebCaptureLocal } from './web-session.ts';

/** (1) 姓名元素文字 → 本次頁面的姓名；沒登記或找不到（null）就沒有。 */
export function pageNamesOf(nameText: string | null): string[] {
  if (nameText === null) return [];
  const alias = headerNameAlias(nameText);
  return [cleanHeaderName(nameText), ...(alias === null ? [] : [alias])].filter(
    (name) => name.trim() !== '',
  );
}

/**
 * Profile 個人資料的姓名欄位（「姓名」「英文姓名」「Name」…）。只用於遮蔽，拿不準時偏向當成姓名
 * （多遮不會把個資送出去）。
 */
const NAME_LABEL = /姓名|名字|^姓氏?$|^名$|name/u;
const isNameKey = (label: string) =>
  NAME_LABEL.test(label.normalize('NFKC').replace(/\s/gu, '').toLowerCase());

/** (3) 既有 Profile 的姓名與聯絡資料值；多份（舊資料）時全部都遮。 */
export function profileValuesOf(profiles: readonly Profile[]): {
  names: string[];
  contacts: string[];
} {
  const names: string[] = [];
  const contacts: string[] = [];
  for (const profile of profiles) {
    for (const [label, value] of Object.entries(profile.personalInfo)) {
      if (value.trim() === '') continue;
      if (isNameKey(label)) names.push(value);
      else if (isPersonalLabel(label)) contacts.push(value);
    }
  }
  return { names, contacts };
}

export function webInputsOf(
  result: ImportWebCaptureResult,
  local: WebCaptureLocal,
  profiles: readonly Profile[],
  confirmedNames: readonly string[],
): WebResumeParseInputs {
  const profile = profileValuesOf(profiles);
  return {
    blocks: result.blocks,
    pageNames: pageNamesOf(local.nameText),
    profileNames: profile.names,
    confirmedNames,
    profileContacts: profile.contacts,
  };
}
