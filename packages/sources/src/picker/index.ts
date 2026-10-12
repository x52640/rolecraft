/** macOS 原生選取器（ADR-0003）：資料夾（可複選）與單一 PDF。 */
export {
  createMacFolderPicker,
  FOLDER_SCRIPT,
  parseFolderOutput,
  type PickerDeps,
} from './folder-picker.ts';
export {
  OSASCRIPT,
  PickerError,
  type ExecFileOptions,
  type ExecFileRunner,
  type PickerFailure,
} from './osascript.ts';
export {
  createMacPdfPicker,
  DEFAULT_MAX_PDF_BYTES,
  PDF_SCRIPT,
  readPickedPdf,
  type PdfPickerDeps,
  type PickedPdfFile,
} from './pdf-picker.ts';
export {
  createMacPhotoPicker,
  PHOTO_SCRIPT,
  readPickedPhoto,
  type PhotoPickerDeps,
  type PickedPhotoFile,
} from './photo-picker.ts';
