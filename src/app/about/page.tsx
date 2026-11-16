import type { Metadata } from "next";
import Link from "next/link";
import { ClearDataButton } from "@/components/ClearDataButton";
import { ArrowLeftIcon, Logo } from "@/components/Icons";

export const metadata: Metadata = {
  title: "About & data sources",
  description:
    "How TurNær works, where its hiking, map, terrain and weather data comes from, and how your location is handled.",
};

type Source = { name: string; url: string; use: string; licence: string; licenceUrl?: string };

const sources: Source[] = [
  {
    name: "Kartverket (Norwegian Mapping Authority)",
    url: "https://www.kartverket.no/",
    use: "Topographic base maps (WMTS cache), place-name search and reverse lookup (Stedsnavn API), address search (Adresse-API), and terrain elevation for profiles (Høydedata API).",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    name: "MET Norway (Norwegian Meteorological Institute)",
    url: "https://api.met.no/",
    use: "Weather forecasts from the Locationforecast 2.0 API: temperature, wind, precipitation, fog and weather symbols.",
    licence: "CC BY 4.0 / NLOD",
    licenceUrl: "https://api.met.no/doc/License",
  },
  {
    name: "OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    use: "Hiking route relations and their geometry (queried through the Overpass API), and an alternative base map.",
    licence: "ODbL",
    licenceUrl: "https://opendatacommons.org/licenses/odbl/",
  },
  {
    name: "Overpass API",
    url: "https://overpass-api.de/",
    use: "Public query service used to read hiking routes from OpenStreetMap. Requests are kept small and cached.",
    licence: "Fair-use policy",
    licenceUrl: "https://wiki.openstreetmap.org/wiki/Overpass_API",
  },
  {
    name: "Waymarked Trails",
    url: "https://hiking.waymarkedtrails.org/",
    use: "Optional map overlay showing marked hiking trails.",
    licence: "CC BY-SA 3.0 (overlay), data ODbL",
    licenceUrl: "https://hiking.waymarkedtrails.org/help/legal",
  },
  {
    name: "Morotur and UT.no",
    url: "https://morotur.no/",
    use: "When a route in OpenStreetMap links to a trip page on Morotur or UT.no, TurNær links you directly to that page. TurNær does not copy or scrape content from these sites.",
    licence: "Content belongs to the respective sites",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-birch-100">
      <header className="border-b border-birch-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-xl font-extrabold text-pine-800">
            <Logo className="text-3xl" /> TurNær
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-semibold text-granite-800 hover:bg-birch-100"
          >
            <ArrowLeftIcon /> Back to the map
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl space-y-10 px-4 py-10">
        <section className="space-y-3">
          <h1 className="text-4xl font-extrabold tracking-tight">About TurNær</h1>
          <p className="text-lg text-granite-700">
            TurNær helps you discover hiking trips close to where you are in Norway. It is a discovery and
            visualisation layer: it shows routes on a map together with weather and terrain, and then sends you to the
            original trip page for the full, authoritative description.
          </p>
          <p className="text-granite-700">
            TurNær is an independent, open-source project. It is <strong>not affiliated with</strong> Kartverket, MET
            Norway, OpenStreetMap, Morotur, UT.no or Den Norske Turistforening.
          </p>
        </section>

        <section aria-labelledby="sources" className="space-y-4">
          <h2 id="sources" className="text-2xl font-bold">
            Data sources
          </h2>
          <ul className="space-y-3">
            {sources.map((s) => (
              <li key={s.name} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-birch-200">
                <h3 className="font-bold">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-fjord-700 underline-offset-2 hover:underline">
                    {s.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </h3>
                <p className="mt-1 text-granite-700">{s.use}</p>
                <p className="mt-2 text-sm text-granite-600">
                  Licence:{" "}
                  {s.licenceUrl ? (
                    <a href={s.licenceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {s.licence}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    s.licence
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="data-quality" className="space-y-3">
          <h2 id="data-quality" className="text-2xl font-bold">
            How to read the numbers
          </h2>
          <ul className="list-disc space-y-2 pl-6 text-granite-700">
            <li>
              <strong>Distance from you</strong> is an approximate straight-line distance (Haversine formula), not a
              walking or driving distance.
            </li>
            <li>
              <strong>Route length</strong>, <strong>difficulty</strong> and <strong>duration</strong> are shown only
              when the source provides them. Values marked <strong>≈</strong> are calculated by TurNær: length from the
              mapped route, ascent from Kartverket&apos;s terrain model, and duration with Naismith&apos;s rule (5 km/h
              plus 1 hour per 600 m of ascent).
            </li>
            <li>
              <strong>Weather conditions</strong> are a simple reading of the MET Norway forecast (wind, precipitation,
              temperature, fog, thunder). They are not a safety assessment. Always check the official forecast,
              avalanche and flood warnings on{" "}
              <a href="https://www.varsom.no/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                varsom.no
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              , and follow the Norwegian mountain code (Fjellvettreglene).
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy" className="space-y-3">
          <h2 id="privacy" className="text-2xl font-bold">
            Privacy
          </h2>
          <ul className="list-disc space-y-2 pl-6 text-granite-700">
            <li>Your location is requested only when you press “Find trips near me”, and it stays in your browser.</li>
            <li>
              To fetch trips, weather and terrain, coordinates are sent directly from your browser to the public services
              listed above. Weather requests use coordinates rounded to about 100 m.
            </li>
            <li>There are no user accounts, no analytics and no tracking. TurNær has no server of its own.</li>
            <li>
              Favourites, your last search (rounded) and cached map-independent data are stored in your browser&apos;s
              local storage so the app works offline. You can remove them at any time.
            </li>
          </ul>
          <ClearDataButton />
        </section>
      </main>
    </div>
  );
}
