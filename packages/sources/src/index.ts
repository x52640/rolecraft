/** sources 的公開入口：資料夾列舉、文件篩選、授權集合、安全讀檔與讀檔紀錄（R4）。 */
export const PACKAGE_NAME = '@rolecraft/sources';

export type * from './types.ts';
export {
  classifyEntry,
  classifyName,
  DEFAULT_MAX_FILE_BYTES,
  type FilterOptions,
} from './filter.ts';
export { type RegistryOptions, type RestoredFolder, SourceRegistry } from './registry.ts';
export { createNodeFolderAccess, type NodeFolderAccessOptions } from './node-folder-access.ts';
export {
  createMacFolderPicker,
  createMacPdfPicker,
  DEFAULT_MAX_PDF_BYTES,
  PickerError,
  type ExecFileRunner,
  type PickedPdfFile,
  type PickerFailure,
} from './picker/index.ts';
