import { TileFrame } from "../../TileFrame";

export function FigmaPromo4x4() {
  return (
    <TileFrame backgroundClassName="bg-neutral-100" textClassName="text-black">
      <div className="relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-R5Rxc1njvx1TxZvdhpup2fzOmNaENd.png"
          alt="White Bay Power Station - Historic industrial brick building with Sydney skyline in background"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between bg-white px-4 py-3">
          <h2 className="text-2xl font-semibold leading-tight text-black">
            White Bay
            <br />
            Power Station
          </h2>
          <svg
            className="h-6 w-6 shrink-0"
            viewBox="0 0 38 57"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M19 28.5C19 31.6826 16.4526 34.25 13.2941 34.25H7.58824V22.75H13.2941C16.4526 22.75 19 25.3174 19 28.5Z"
              fill="#A259FF"
            />
            <path
              d="M7.58824 11.25H13.2941C16.4526 11.25 19 13.8174 19 17C19 20.1826 16.4526 22.75 13.2941 22.75H7.58824V11.25Z"
              fill="#F24E1E"
            />
            <path
              d="M7.58824 34.25H13.2941C16.4526 34.25 19 36.8174 19 40C19 43.1826 16.4526 45.75 13.2941 45.75H13.2941C10.1357 45.75 7.58824 43.1826 7.58824 40V34.25Z"
              fill="#0ACF83"
            />
            <path
              d="M19 11.25H24.7059C27.8643 11.25 30.4118 13.8174 30.4118 17C30.4118 20.1826 27.8643 22.75 24.7059 22.75H19V11.25Z"
              fill="#FF7262"
            />
            <path
              d="M30.4118 28.5C30.4118 31.6826 27.8643 34.25 24.7059 34.25C21.5474 34.25 19 31.6826 19 28.5C19 25.3174 21.5474 22.75 24.7059 22.75C27.8643 22.75 30.4118 25.3174 30.4118 28.5Z"
              fill="#1ABCFE"
            />
          </svg>
        </div>
      </div>
    </TileFrame>
  );
}
