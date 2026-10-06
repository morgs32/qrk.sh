import { useEffect, useState } from 'react';

const mobileQuery = '(max-width: 767px)';

export function useMobile() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia(mobileQuery).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(mobileQuery);
    const changed = () => setMobile(media.matches);
    media.addEventListener('change', changed);
    changed();
    return () => media.removeEventListener('change', changed);
  }, []);

  return mobile;
}
