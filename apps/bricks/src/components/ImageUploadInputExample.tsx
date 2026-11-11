import { useEffect, useRef, useState } from "react";

import { ImageUploadInput } from "./ImageUploadInput";

export function ImageUploadInputExample() {
  const [source, setSource] = useState<{
    imageUrl: string;
    crop: Parameters<typeof ImageUploadInput>[0]["crop"];
  }>({
    imageUrl: "",
    crop: null,
  });
  const objectUrl = useRef<string>(null);

  useEffect(
    () => () => {
      if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  return (
    <ImageUploadInput
      label="Edit"
      imageUrl={source.imageUrl}
      crop={source.crop}
      getFrameAspectRatio={() => 4 / 3}
      onApply={setSource}
      uploadImage={async (file) => {
        const nextUrl = URL.createObjectURL(file);
        if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = nextUrl;
        return nextUrl;
      }}
    />
  );
}
