import Dexie, { type Table } from "dexie";

export interface DraftAttachment {
  id: string;
  fileBuffer: ArrayBuffer;
  fileName: string;
  fileType: string;
  previewUrl: string | null;
  extractedText: string;
  extension: string;
  status: 'idle' | 'uploading' | 'error';
  conversationId: string | 'new';
  timestamp: number;
}

export class DraftsDatabase extends Dexie {
  draftAttachments!: Table<DraftAttachment, string>;

  constructor() {
    super("DraftsDB");
    this.version(1).stores({
      draftAttachments: "id, conversationId", // Primary key and indexed props
    });
  }
}

export const draftsDb = new DraftsDatabase();

export async function saveDraftAttachment(conversationId: string, att: any): Promise<void> {
  const arrayBuffer = await att.file.arrayBuffer();
  await draftsDb.draftAttachments.put({
    id: att.id,
    fileBuffer: arrayBuffer,
    fileName: att.file.name,
    fileType: att.file.type,
    previewUrl: att.previewUrl,
    extractedText: att.extractedText,
    extension: att.extension,
    status: 'idle', // Reset status on save
    conversationId: conversationId || 'new',
    timestamp: Date.now()
  });
}

export async function getDraftAttachments(conversationId: string): Promise<any[]> {
  const drafts = await draftsDb.draftAttachments.where('conversationId').equals(conversationId || 'new').toArray();
  return drafts.map(draft => {
    const file = new File([draft.fileBuffer], draft.fileName, { type: draft.fileType });
    
    let previewUrl = draft.previewUrl;
    if (draft.extension && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(draft.extension.toLowerCase())) {
      previewUrl = URL.createObjectURL(file);
    }
    
    return {
      id: draft.id,
      file,
      previewUrl,
      extractedText: draft.extractedText,
      extension: draft.extension,
      status: draft.status
    };
  });
}

export async function deleteDraftAttachment(id: string): Promise<void> {
  await draftsDb.draftAttachments.delete(id);
}

export async function clearDraftAttachments(conversationId: string): Promise<void> {
  const drafts = await draftsDb.draftAttachments.where('conversationId').equals(conversationId || 'new').toArray();
  await Promise.all(drafts.map(d => draftsDb.draftAttachments.delete(d.id)));
}
