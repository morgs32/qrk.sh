import { Link } from "../../../components/Link";
import { makeComponentView } from "../../react/makeComponentView";
import { buyMeACoffeeCardComponentMetadata } from "../definition/buyMeACoffeeV1";

export const buyMeACoffeeCardView = makeComponentView(buyMeACoffeeCardComponentMetadata, {
  component(props) {
    const { url, message } = props;
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md bg-amber-50 p-3 text-center text-amber-950">
        <svg aria-hidden="true" viewBox="0 0 72 52" className="h-12 w-[66px]" fill="none">
          <ellipse cx="35" cy="46" rx="27" ry="4" fill="#FDE68A" />
          <path d="M49 24h8a7 7 0 0 1 0 14h-8" stroke="#92400E" strokeWidth="3" />
          <path
            d="M17 21h35v10a16 16 0 0 1-16 16h-3a16 16 0 0 1-16-16z"
            fill="#FBBF24"
            stroke="#92400E"
            strokeWidth="3"
          />
          <path
            d="M28 15c-5-4 4-6 0-11m11 11c-5-4 4-6 0-11"
            stroke="#92400E"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
        {message !== "" && <p className="text-sm break-words">{message}</p>}
        <Link
          href={url}
          className="rounded-md bg-amber-300 px-3 py-2 text-sm font-semibold hover:bg-amber-400"
        >
          Buy Me a Coffee
        </Link>
      </div>
    );
  },
});
