import { useEffect, useState } from 'react';

export default function useMediaQuery(query) {
    const readMatch = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
    const [matches, setMatches] = useState(readMatch);

    useEffect(() => {
        const media = window.matchMedia(query);
        const onChange = (event) => setMatches(event.matches);
        setMatches(media.matches);
        if (media.addEventListener) media.addEventListener('change', onChange);
        else media.addListener(onChange);
        return () => {
            if (media.removeEventListener) media.removeEventListener('change', onChange);
            else media.removeListener(onChange);
        };
    }, [query]);

    return matches;
}
