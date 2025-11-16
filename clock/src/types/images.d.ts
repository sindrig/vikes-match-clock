declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

declare module "*.jpeg" {
  const content: string;
  export default content;
}

declare module "*.gif" {
  const content: string;
  export default content;
}

declare module "*.mp3" {
  const content: string;
  export default content;
}

declare module "compress.js" {
  interface CompressedImage {
    data: string;
    ext: string;
    alt: string;
  }

  interface CompressOptions {
    size?: number;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    resize?: boolean;
  }

  class Compress {
    compress(files: File[], options: CompressOptions): Promise<CompressedImage[]>;
    static convertBase64ToFile(base64: string, mime: string): File;
  }

  export default Compress;
}
