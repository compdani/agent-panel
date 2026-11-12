// Types for attachments.mjs (agent-panel/attachments).

export interface Limits {
  /** Allowed types, as in `<input type="file" accept>`. Empty allows every file. */
  accept: string;
  /** Largest single file, in bytes. */
  maxFileSize: number;
  /** Largest combined size of all attachments, in bytes. */
  maxTotalSize: number;
  /** Most files attached at once. */
  maxFiles: number;
}

export declare const DEFAULT_LIMITS: Readonly<Limits>;

/** A file extension (without the dot) for a MIME type, e.g. `png` for `image/png`. */
export declare function extensionFor(mime: string | null | undefined): string;

/** The files in a drop's DataTransfer. */
export declare function filesFromDataTransfer(dataTransfer: DataTransfer | null | undefined): File[];

/** The files a paste should attach, or `[]` to leave the paste as text (see A4). */
export declare function pastedFiles(clipboardData: DataTransfer | null | undefined): File[];

/** The name a file is attached under: its own, or a generated one (see A3). */
export declare function nameFor(file: File, opts?: { pasted?: boolean; now?: Date; index?: number }): string;

/** Whether `file` matches an `accept` string (see A5). */
export declare function matchesAccept(file: { name?: string; type?: string }, accept: string): boolean;

/** A short human size, e.g. `1.5 MB`. */
export declare function formatBytes(size: number): string;

/** Why `file` can't join `current`, or `''` if it can (see A6). */
export declare function attachmentProblem(
  file: File,
  current?: ReadonlyArray<{ size?: number }>,
  limits?: Partial<Limits>,
): string;

/** The file's contents as base64, without a `data:` prefix. */
export declare function readAsBase64(file: Blob): Promise<string>;
