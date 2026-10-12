// 網頁來源 AI 整理的輸入（P1-T080；resume-import「網頁來源的 AI 整理」W6）。四個姓名來源：
// (1) 姓名元素文字 nameText：cleanHeaderName 切出的姓名，加上 headerNameAlias 切出的英文名（附註 1）；
// (2) 標籤為姓名的區塊值：由 pipeline 從區塊找；(3) 資料區既有 Profile 的姓名；(4) 請求帶來的使用者確認姓名。
// 既有 Profile 的聯絡資料值也加入遮蔽。網址不放進輸入（只留 helper 本機）。
import type { ImportWebCaptureResult, Profile } from '@rolecraft/contracts';
import { isNameLabel, isPersonalBlockLabel, type WebResumeParseInputs } from '@rolecraft/pipeline';
import { cleanHeaderName, headerNameAlias } from '@rolecraft/resume-import';

import type { WebCaptureLocal } from './web-session.ts';

/** 可靠的姓名形狀：2～5 個中文字，或 1～3 個大寫開頭的英文字。 */
const HAN_NAME = /^\p{Script=Han}{2,5}$/u;
const ENGLISH_NAME = /^[A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,2}$/u;

export interface PageNames {
  /** 算本次頁面姓名已辨識（送出條件 (1)） */
  readonly recognized: string[];
  /** 拆不出可靠姓名的整串：只遮、不算辨識（P1-T080 審查 5） */
  readonly maskOnly: string[];
}

/**
 * (1) 姓名元素文字 → 本次頁面的姓名；沒登記或找不到（null）就沒有。切出的姓名形狀不可靠
 * （「Alex Smith Great Developer」「林測試的履歷」）時不算辨識，要使用者確認姓名（保守）。
 */
export function pageNamesOf(nameText: string | null): PageNames {
  const text = nameText?.trim() ?? '';
  if (text === '') return { recognized: [], maskOnly: [] };
  const cleaned = cleanHeaderName(text);
  if (HAN_NAME.test(cleaned)) {
    const alias = headerNameAlias(text);
    return { recognized: [cleaned, ...(alias === null ? [] : [alias])], maskOnly: [] };
  }
  if (ENGLISH_NAME.test(text)) {
    // 三個字時另加前兩個字（「Mary Ann Smith」→「Mary Ann」，與 headerNameAlias 同規則）
    const words = text.split(/\s+/u);
    const firstTwo = words.length === 3 ? [words.slice(0, 2).join(' ')] : [];
    return { recognized: [text, ...firstTwo], maskOnly: [] };
  }
  return { recognized: [], maskOnly: [text] };
}

/**
 * Profile 個人資料的姓名欄位：pipeline isNameLabel（姓名、英文名、中文名、暱稱、綽號、本名、Name…；審查 2），
 * 另外含「名字」「name」的也當姓名（只用於遮蔽，多遮不會把個資送出去）。
 */
const LOOSE_NAME = /姓名|名字|name/u;
const isNameKey = (label: string) =>
  isNameLabel(label) || LOOSE_NAME.test(label.normalize('NFKC').replace(/\s/gu, '').toLowerCase());

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
      else if (isPersonalBlockLabel(label)) contacts.push(value);
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
  const page = pageNamesOf(local.nameText);
  return {
    blocks: result.blocks,
    pageNames: page.recognized,
    // profileNames 只遮蔽、不算辨識：拆不出姓名的整串頁首也放這裡
    profileNames: [...profile.names, ...page.maskOnly],
    confirmedNames,
    profileContacts: profile.contacts,
  };
}
