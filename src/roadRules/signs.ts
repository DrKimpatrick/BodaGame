/**
 * Sign artwork as SVG. Shapes and colours follow the British-derived pattern the Ugandan Highway Code uses,
 * but they are drawn, not official MoWT artwork; swap in official images when available.
 * Used for the UI cards and (rasterised once) for the signs standing in the 3D city.
 */

const tri = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,7 95,88 5,88" fill="#fff" stroke="#d62828" stroke-width="9" stroke-linejoin="round"/>${inner}</svg>`
const roundel = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#fff" stroke="#d62828" stroke-width="10"/>${inner}</svg>`
const limit = (n: number) =>
  roundel(`<text x="50" y="64" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="40" fill="#111">${n}</text>`)

const PROTOTYPE: Record<string, string> = {
  "stop": "<svg viewBox=\"0 0 100 100\"><polygon points=\"30,3 70,3 97,30 97,70 70,97 30,97 3,70 3,30\" fill=\"#d62828\" stroke=\"#fff\" stroke-width=\"4\"/><text x=\"50\" y=\"60\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-weight=\"800\" font-size=\"25\" fill=\"#fff\">STOP</text></svg>",
  "giveway": "<svg viewBox=\"0 0 100 100\"><polygon points=\"8,12 92,12 50,90\" fill=\"#fff\" stroke=\"#d62828\" stroke-width=\"10\" stroke-linejoin=\"round\"/></svg>",
  "redlight": "<svg viewBox=\"0 0 100 100\"><rect x=\"28\" y=\"4\" width=\"44\" height=\"92\" rx=\"10\" fill=\"#1a1a1a\" stroke=\"#666\" stroke-width=\"2\"/><circle cx=\"50\" cy=\"26\" r=\"11\" fill=\"#ff3b30\"/><circle cx=\"50\" cy=\"50\" r=\"11\" fill=\"#4a3b12\"/><circle cx=\"50\" cy=\"74\" r=\"11\" fill=\"#12331f\"/></svg>",
  "zebra": "<svg viewBox=\"0 0 100 100\"><rect x=\"4\" y=\"4\" width=\"92\" height=\"92\" rx=\"8\" fill=\"#1d4e9e\"/><polygon points=\"50,14 88,78 12,78\" fill=\"#fff\" stroke=\"#d62828\" stroke-width=\"5\" stroke-linejoin=\"round\"/><circle cx=\"50\" cy=\"42\" r=\"5\" fill=\"#111\"/><path d=\"M50 48 L50 62 M50 52 L42 58 M50 52 L58 56 M50 62 L44 72 M50 62 L57 72\" stroke=\"#111\" stroke-width=\"3.5\" stroke-linecap=\"round\" fill=\"none\"/><g fill=\"#fff\"><rect x=\"16\" y=\"84\" width=\"14\" height=\"6\"/><rect x=\"36\" y=\"84\" width=\"14\" height=\"6\"/><rect x=\"56\" y=\"84\" width=\"14\" height=\"6\"/><rect x=\"76\" y=\"84\" width=\"8\" height=\"6\"/></g></svg>",
  "school": "<svg viewBox=\"0 0 100 100\"><polygon points=\"50,7 95,88 5,88\" fill=\"#fff\" stroke=\"#d62828\" stroke-width=\"9\" stroke-linejoin=\"round\"/><circle cx=\"39\" cy=\"49\" r=\"5\"/><circle cx=\"61\" cy=\"53\" r=\"5\"/><path d=\"M39 55 L39 67 M39 59 L32 65 M39 59 L46 64 M39 67 L35 77 M39 67 L44 77 M61 59 L61 71 M61 63 L54 69 M61 63 L68 68 M61 71 L57 81 M61 71 L66 81\" stroke=\"#111\" stroke-width=\"3.5\" stroke-linecap=\"round\" fill=\"none\"/></svg>",
  "speed50": "<svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"42\" fill=\"#fff\" stroke=\"#d62828\" stroke-width=\"10\"/><text x=\"50\" y=\"64\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-weight=\"800\" font-size=\"40\" fill=\"#111\">50</text></svg>",
  "noovertake": "<svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"42\" fill=\"#fff\" stroke=\"#d62828\" stroke-width=\"10\"/><rect x=\"24\" y=\"36\" width=\"20\" height=\"30\" rx=\"5\" fill=\"#111\"/><rect x=\"56\" y=\"36\" width=\"20\" height=\"30\" rx=\"5\" fill=\"#d62828\"/></svg>",
  "noentry": "<svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"46\" fill=\"#d62828\"/><rect x=\"18\" y=\"42\" width=\"64\" height=\"16\" fill=\"#fff\"/></svg>",
  "roundabout": "<svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"46\" fill=\"#1d4e9e\"/><circle cx=\"50\" cy=\"50\" r=\"22\" fill=\"none\" stroke=\"#fff\" stroke-width=\"6\"/><g fill=\"#fff\"><polygon points=\"64,28 50,19 50,37\"/><polygon points=\"64,28 50,19 50,37\" transform=\"rotate(120 50 50)\"/><polygon points=\"64,28 50,19 50,37\" transform=\"rotate(240 50 50)\"/></g></svg>",
  "bump": "<svg viewBox=\"0 0 100 100\"><polygon points=\"50,7 95,88 5,88\" fill=\"#fff\" stroke=\"#d62828\" stroke-width=\"9\" stroke-linejoin=\"round\"/><path d=\"M18 80 Q50 40 82 80 Z\" fill=\"#111\"/></svg>",
}

const EXTRA: Record<string, string> = {
  giveway:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="6,10 94,10 50,92" fill="#fff" stroke="#d62828" stroke-width="10" stroke-linejoin="round"/><text x="50" y="38" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="13" fill="#111">GIVE</text><text x="50" y="53" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="13" fill="#111">WAY</text></svg>',
  speed30: limit(30),
  speed50: limit(50),
  keepleft:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#1d4e9e"/><path d="M68 30 L38 60" stroke="#fff" stroke-width="11" stroke-linecap="round"/><polygon points="26,72 30,46 52,68" fill="#fff"/></svg>',
  pavement:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#1d4e9e"/><circle cx="50" cy="26" r="7" fill="#fff"/><path d="M50 35 L50 58 M50 42 L38 52 M50 42 L62 50 M50 58 L40 76 M50 58 L60 76" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/></svg>',
}

const SIGNS: Record<string, string> = { ...PROTOTYPE, ...EXTRA }

/** Yellow "road rule" card (not an official sign) or a warning triangle around an emoji. */
export function signSvg(key: string): string {
  if (key.startsWith('e:')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="16" fill="#f5c518"/><text x="50" y="68" text-anchor="middle" font-size="52">${key.slice(2)}</text></svg>`
  }
  if (key.startsWith('w:')) {
    return tri(`<text x="50" y="74" text-anchor="middle" font-size="32">${key.slice(2)}</text>`)
  }
  return SIGNS[key] ?? SIGNS.stop!
}

/** True for official-style signs; false for the yellow "Road rule" cards. */
export function isOfficialSign(key: string): boolean {
  return !key.startsWith('e:')
}

/** Data URL for <img> / textures (standalone SVG needs the xmlns attribute). */
export function svgDataUrl(svg: string): string {
  const withNs = svg.includes('xmlns=') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`
}

export function signDataUrl(key: string): string {
  return svgDataUrl(signSvg(key))
}

/** Painted road legend ("STOP", "SLOW", "SCHOOL") as white text on transparent, for the tarmac. */
export function roadTextSvg(text: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="50" y="42" text-anchor="middle" font-family="Arial Narrow,Arial,sans-serif" font-weight="800" font-size="44" fill="#f4f4f0" transform="scale(1 1)">${text}</text></svg>`
}
