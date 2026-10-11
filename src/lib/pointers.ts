// Pointer types: one geometry and one look (app.css `.ptr[data-p]`) shared by the page guide, the
// Stage and the previews in Reading aids.
export type PointerType = 'underline' | 'word' | 'highlighter' | 'type' | 'outline' | 'bracket' | 'spotlight' | 'caret' | 'dot'

export const POINTERS: [PointerType, string, string][] = [
  ['underline', 'Line', 'A line under the word'],
  ['highlighter', 'Marker', 'A highlighter pass along the lower half'],
  ['word', 'Box', 'A soft box around the word'],
  ['type', 'Type', 'Letters type themselves in'],
  ['spotlight', 'Glow', 'A soft pool of light behind the word'],
  ['bracket', 'Brackets', 'Corner brackets frame the word'],
  ['outline', 'Ring', 'A thin ring around the word'],
  ['caret', 'Caret', 'A caret just before the word'],
  ['dot', 'Dot', 'A dot under the word'],
]

/** The pointer box [x, y, w, h] for a word box (left, top, width, height). */
export function pointerBox(p: PointerType | 'ink', l: number, t: number, w: number, h: number): [number, number, number, number] {
  switch (p) {
    case 'underline': return [l, t + h - 1, w, 3]
    case 'highlighter': return [l - 3, t + h * 0.5, w + 6, h * 0.44]
    case 'spotlight': return [l - 16, t - 9, w + 32, h + 18]
    case 'bracket': return [l - 5, t, w + 10, h]
    case 'caret': return [l - 6, t + 2, 2.5, h - 4]
    case 'dot': return [l + w / 2 - 3, t + h + 2, 6, 6]
    case 'type': return [l - 2, t - 1, w + 4, h + 2]
    default: return [l - 4, t - 1, w + 8, h + 2] // word, outline
  }
}
