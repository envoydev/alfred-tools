// What sign-in takes from the client's stderr, in memory: the sign-in link and the moment no browser opened. A line is read,
// never kept or echoed; the only text that leaves is the https link the client itself named after its authorize marker.
import { AUTHORIZE_MARKER, LINK_PROTOCOL, MAX_LINE_LENGTH, NO_BROWSER_MARKER, PID_PREFIX_PATTERN } from './constants.ts';
import type { AuthorizeWatch } from './types.ts';

// -> the text itself, as the client wrote it, when it is one https URL and nothing else - no white space, no control
// character a terminal would act on - else null
export function httpsLinkOf(text: string): string | null
{
    if (/[\s\u0000-\u001f\u007f-\u009f]/.test(text)) return null;
    try { return new URL(text).protocol === LINK_PROTOCOL ? text : null; }
    catch { return null; }
}

export function watchAuthorize(): AuthorizeWatch
{
    let link: string | null = null;
    let afterMarker = false;
    let announced = false;
    return {
        link: () => link,
        feed(rawLine)
        {
            if (rawLine.length > MAX_LINE_LENGTH) { afterMarker = false; return null; }
            const text = rawLine.replace(PID_PREFIX_PATTERN, '').trim();
            const wasAfterMarker = afterMarker;
            afterMarker = text.startsWith(AUTHORIZE_MARKER);
            if (wasAfterMarker && link === null) link = httpsLinkOf(text);
            if (!text.startsWith(NO_BROWSER_MARKER) || announced || link === null) return null;
            announced = true;
            return link;
        },
    };
}
