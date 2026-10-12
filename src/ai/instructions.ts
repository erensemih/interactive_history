import okumaArkadasi from '../../instructions/okuma-arkadasi.txt?raw';

/**
 * The standing instructions of the in-app model: a plain-text file (instructions/okuma-arkadasi.txt) that its
 * owner edits by hand. The page sends it, as it is, at the start of every call; what the page adds after it
 * (which tool does which of the things the file names, and the shape of an answer) is in `prompt.ts`.
 * The file reaches the app at build time, so a change to it takes effect with the next build.
 */
export const INSTRUCTIONS_FILE: string = okumaArkadasi.replace(/\r\n?/g, '\n').trimEnd();
