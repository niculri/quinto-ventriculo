// How the API reads the images (and the card browser's indexes) of the media store.
interface MediaObject {
  body: ReadableStream | ArrayBuffer | Uint8Array;
  contentType: string;
  etag?: string;
}

export interface MediaStore {
  get(key: string): Promise<MediaObject | null>;
  has?(key: string): Promise<boolean>;
}
