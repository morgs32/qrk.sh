import { TileFrame } from "../../TileFrame";

export function ImagePromo4x4() {
  return (
    <TileFrame backgroundClassName="bg-neutral-100" textClassName="text-black">
      <div className="relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-R5Rxc1njvx1TxZvdhpup2fzOmNaENd.png"
          alt="White Bay Power Station - Historic industrial brick building with Sydney skyline in background"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-white px-4 py-3">
          <h2 className="text-2xl font-semibold leading-tight text-black">
            White Bay
            <br />
            Power Station
          </h2>
        </div>
      </div>
    </TileFrame>
  );
}
