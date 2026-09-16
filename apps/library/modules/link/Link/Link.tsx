import { Image } from "@unpic/react";

export function Link(props: {
  data: {
    url: string;
    title: string;
    description: string;
    siteName: string;
    imageUrl: string;
    iconUrl: string;
  };
}) {
  return (
    <a
      className="block h-full w-full no-underline"
      data-link-card="default"
      href={props.data.url.length > 0 ? props.data.url : undefined}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden bg-sky-50">
        <div className="flex min-w-0 flex-1 flex-col justify-start p-4">
          {props.data.iconUrl.length > 0 ? (
            <Image
              alt=""
              className="mb-3 h-10 w-10 shrink-0 object-cover"
              height={40}
              layout="constrained"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              src={props.data.iconUrl}
              width={40}
            />
          ) : null}
          <h2 className="m-0 line-clamp-3">
            {props.data.title}
          </h2>
          <p className="m-0 mt-1 truncate">{props.data.siteName}</p>
        </div>

        {props.data.imageUrl.length > 0 ? (
          <div className="relative h-full w-[44%] shrink-0 overflow-hidden bg-zinc-200">
            <Image
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              layout="fullWidth"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              sizes="(max-width: 768px) 44vw, 22vw"
              src={props.data.imageUrl}
            />
          </div>
        ) : null}
      </div>
    </a>
  );
}
