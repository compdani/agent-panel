import type { Attachment, Reference, SubmitDetail } from './element.js';
export interface Asset extends Reference {
  type: 'asset';
  name?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  fileId?: string;
}
export type OpenAIContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; detail: 'auto'; image_url?: string; file_id?: string }
  | { type: 'input_file'; filename?: string; file_data?: string; file_url?: string; file_id?: string };
export interface Submission {
  text?: string;
  attachments?: (Attachment | File)[];
  references?: Reference[];
  assets?: Asset[];
}
export declare function assetUrl(value: unknown): string;
export declare function toOpenAIContent(detail?: Submission): Promise<OpenAIContent[]>;
export declare function prepareSubmission(detail: SubmitDetail & { assets?: Asset[] }, options?: {
  upload?: (file: File, attachment: Attachment) => Promise<Partial<Asset>>;
}): Promise<{ assets: Asset[]; content: OpenAIContent[] }>;
