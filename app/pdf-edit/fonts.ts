import localFont from "next/font/local";

/* Editor fonts — static TrueType files from Google Fonts (all OFL / Apache
 * licensed), bundled with next/font/local. TrueType rather than
 * next/font/google's WOFF2 because the same file is embedded into saved
 * PDFs, and PDFs need TrueType. `preload: false`: each file only
 * downloads once it's actually used or previewed.
 * (next/font needs plain literal options, hence the repetition.) */

const inter = localFont({
  src: [
    { path: "./fonts/Inter-400.ttf", weight: "400" },
    { path: "./fonts/Inter-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const roboto = localFont({
  src: [
    { path: "./fonts/Roboto-400.ttf", weight: "400" },
    { path: "./fonts/Roboto-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const openSans = localFont({
  src: [
    { path: "./fonts/OpenSans-400.ttf", weight: "400" },
    { path: "./fonts/OpenSans-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const montserrat = localFont({
  src: [
    { path: "./fonts/Montserrat-400.ttf", weight: "400" },
    { path: "./fonts/Montserrat-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const oswald = localFont({
  src: [
    { path: "./fonts/Oswald-400.ttf", weight: "400" },
    { path: "./fonts/Oswald-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const bebasNeue = localFont({
  src: [
    { path: "./fonts/BebasNeue-400.ttf", weight: "400" },
  ],
  preload: false,
  display: "swap",
});
const robotoCondensed = localFont({
  src: [
    { path: "./fonts/RobotoCondensed-400.ttf", weight: "400" },
    { path: "./fonts/RobotoCondensed-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const anton = localFont({
  src: [
    { path: "./fonts/Anton-400.ttf", weight: "400" },
  ],
  preload: false,
  display: "swap",
});
const merriweather = localFont({
  src: [
    { path: "./fonts/Merriweather-400.ttf", weight: "400" },
    { path: "./fonts/Merriweather-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const playfair = localFont({
  src: [
    { path: "./fonts/PlayfairDisplay-400.ttf", weight: "400" },
    { path: "./fonts/PlayfairDisplay-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const lora = localFont({
  src: [
    { path: "./fonts/Lora-400.ttf", weight: "400" },
    { path: "./fonts/Lora-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const garamond = localFont({
  src: [
    { path: "./fonts/EBGaramond-400.ttf", weight: "400" },
    { path: "./fonts/EBGaramond-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const robotoMono = localFont({
  src: [
    { path: "./fonts/RobotoMono-400.ttf", weight: "400" },
    { path: "./fonts/RobotoMono-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const courierPrime = localFont({
  src: [
    { path: "./fonts/CourierPrime-400.ttf", weight: "400" },
    { path: "./fonts/CourierPrime-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const dancing = localFont({
  src: [
    { path: "./fonts/DancingScript-400.ttf", weight: "400" },
    { path: "./fonts/DancingScript-700.ttf", weight: "700" },
  ],
  preload: false,
  display: "swap",
});
const allura = localFont({
  src: [
    { path: "./fonts/Allura-400.ttf", weight: "400" },
  ],
  preload: false,
  display: "swap",
});
const sacramento = localFont({
  src: [
    { path: "./fonts/Sacramento-400.ttf", weight: "400" },
  ],
  preload: false,
  display: "swap",
});
const indieFlower = localFont({
  src: [
    { path: "./fonts/IndieFlower-400.ttf", weight: "400" },
  ],
  preload: false,
  display: "swap",
});
const patrickHand = localFont({
  src: [
    { path: "./fonts/PatrickHand-400.ttf", weight: "400" },
  ],
  preload: false,
  display: "swap",
});

/** CSS font-family for each bundled font, keyed like lib/editor/fonts.ts. */
export const EDITOR_FONT_FAMILIES = {
  inter: inter.style.fontFamily,
  roboto: roboto.style.fontFamily,
  opensans: openSans.style.fontFamily,
  montserrat: montserrat.style.fontFamily,
  oswald: oswald.style.fontFamily,
  bebas: bebasNeue.style.fontFamily,
  robotocondensed: robotoCondensed.style.fontFamily,
  anton: anton.style.fontFamily,
  merriweather: merriweather.style.fontFamily,
  playfair: playfair.style.fontFamily,
  lora: lora.style.fontFamily,
  garamond: garamond.style.fontFamily,
  robotomono: robotoMono.style.fontFamily,
  courierprime: courierPrime.style.fontFamily,
  dancing: dancing.style.fontFamily,
  allura: allura.style.fontFamily,
  sacramento: sacramento.style.fontFamily,
  indieflower: indieFlower.style.fontFamily,
  patrickhand: patrickHand.style.fontFamily,
};

/* Picker previews — each file holds only the letters of that font's own
 * name (2–8 KB, ~95 KB for all), so the font list can show every name in
 * its real font without downloading the full fonts. The full file only
 * downloads once a font is actually picked. */
const interPreview = localFont({
  src: "./fonts/preview/Inter.ttf",
  preload: false,
  display: "block",
});
const robotoPreview = localFont({
  src: "./fonts/preview/Roboto.ttf",
  preload: false,
  display: "block",
});
const opensansPreview = localFont({
  src: "./fonts/preview/OpenSans.ttf",
  preload: false,
  display: "block",
});
const montserratPreview = localFont({
  src: "./fonts/preview/Montserrat.ttf",
  preload: false,
  display: "block",
});
const oswaldPreview = localFont({
  src: "./fonts/preview/Oswald.ttf",
  preload: false,
  display: "block",
});
const bebasPreview = localFont({
  src: "./fonts/preview/BebasNeue.ttf",
  preload: false,
  display: "block",
});
const robotocondensedPreview = localFont({
  src: "./fonts/preview/RobotoCondensed.ttf",
  preload: false,
  display: "block",
});
const antonPreview = localFont({
  src: "./fonts/preview/Anton.ttf",
  preload: false,
  display: "block",
});
const merriweatherPreview = localFont({
  src: "./fonts/preview/Merriweather.ttf",
  preload: false,
  display: "block",
});
const playfairPreview = localFont({
  src: "./fonts/preview/PlayfairDisplay.ttf",
  preload: false,
  display: "block",
});
const loraPreview = localFont({
  src: "./fonts/preview/Lora.ttf",
  preload: false,
  display: "block",
});
const garamondPreview = localFont({
  src: "./fonts/preview/EBGaramond.ttf",
  preload: false,
  display: "block",
});
const robotomonoPreview = localFont({
  src: "./fonts/preview/RobotoMono.ttf",
  preload: false,
  display: "block",
});
const courierprimePreview = localFont({
  src: "./fonts/preview/CourierPrime.ttf",
  preload: false,
  display: "block",
});
const dancingPreview = localFont({
  src: "./fonts/preview/DancingScript.ttf",
  preload: false,
  display: "block",
});
const alluraPreview = localFont({
  src: "./fonts/preview/Allura.ttf",
  preload: false,
  display: "block",
});
const sacramentoPreview = localFont({
  src: "./fonts/preview/Sacramento.ttf",
  preload: false,
  display: "block",
});
const indieflowerPreview = localFont({
  src: "./fonts/preview/IndieFlower.ttf",
  preload: false,
  display: "block",
});
const patrickhandPreview = localFont({
  src: "./fonts/preview/PatrickHand.ttf",
  preload: false,
  display: "block",
});

/** CSS font-family of each preview font, keyed like EDITOR_FONT_FAMILIES. */
export const EDITOR_FONT_PREVIEWS = {
  inter: interPreview.style.fontFamily,
  roboto: robotoPreview.style.fontFamily,
  opensans: opensansPreview.style.fontFamily,
  montserrat: montserratPreview.style.fontFamily,
  oswald: oswaldPreview.style.fontFamily,
  bebas: bebasPreview.style.fontFamily,
  robotocondensed: robotocondensedPreview.style.fontFamily,
  anton: antonPreview.style.fontFamily,
  merriweather: merriweatherPreview.style.fontFamily,
  playfair: playfairPreview.style.fontFamily,
  lora: loraPreview.style.fontFamily,
  garamond: garamondPreview.style.fontFamily,
  robotomono: robotomonoPreview.style.fontFamily,
  courierprime: courierprimePreview.style.fontFamily,
  dancing: dancingPreview.style.fontFamily,
  allura: alluraPreview.style.fontFamily,
  sacramento: sacramentoPreview.style.fontFamily,
  indieflower: indieflowerPreview.style.fontFamily,
  patrickhand: patrickhandPreview.style.fontFamily,
};
