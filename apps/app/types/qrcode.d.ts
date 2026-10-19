declare module "qrcode" {
  export type IQRCodeToDataURLOptions = {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
    scale?: number;
  };

  export function toDataURL(text: string, options?: IQRCodeToDataURLOptions): Promise<string>;
}
