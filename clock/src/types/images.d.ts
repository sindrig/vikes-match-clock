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
  interface CompressOptions {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    crop?: boolean;
    aspectRatio?: string;
  }

  class Compress {
    constructor(options?: CompressOptions);
    compress(file: File, options?: CompressOptions): Promise<File>;
  }

  export default Compress;
}
