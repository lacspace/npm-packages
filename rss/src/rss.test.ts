import { test, expect } from "vitest";
import {
  rss,
  atom,
  jsonFeed,
  podcastRss,
  podcastRssResponse,
  type PodcastFeed,
  type PodcastEpisode,
} from "./index";

const feed = { title: "Blog", link: "https://acme.com", description: "News" };

test("rss() basics unchanged", () => {
  const out = rss(feed, [
    { title: "Hello", link: "https://acme.com/1", date: "2026-01-01T00:00:00Z" },
  ]);
  expect(out).toContain('<rss version="2.0"');
  expect(out).toContain("<title>Hello</title>");
  expect(out).toContain("<guid isPermaLink=\"true\">https://acme.com/1</guid>");
});

test("rss() emits media:content and declares the mrss namespace", () => {
  const out = rss(feed, [
    {
      title: "Pic",
      link: "https://acme.com/p",
      media: { url: "https://acme.com/p.jpg", type: "image/jpeg", medium: "image", width: 800 },
    },
  ]);
  expect(out).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
  expect(out).toContain('<media:content url="https://acme.com/p.jpg"');
  expect(out).toContain('medium="image"');
  expect(out).toContain('width="800"');
});

test("rss() supports an array of media with title child", () => {
  const out = rss(feed, [
    {
      title: "Gallery",
      link: "https://acme.com/g",
      media: [
        { url: "https://acme.com/a.jpg", type: "image/jpeg", title: "A" },
        { url: "https://acme.com/b.jpg", type: "image/jpeg" },
      ],
    },
  ]);
  expect(out.match(/<media:content/g)?.length).toBe(2);
  expect(out).toContain('<media:title type="plain">A</media:title>');
});

test("atom() emits enclosure link and media:content", () => {
  const out = atom(feed, [
    {
      title: "Ep",
      link: "https://acme.com/e",
      enclosure: { url: "https://acme.com/e.mp3", type: "audio/mpeg", length: 123 },
      media: { url: "https://acme.com/e.jpg", type: "image/jpeg" },
    },
  ]);
  expect(out).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
  expect(out).toContain('<link rel="enclosure" href="https://acme.com/e.mp3" type="audio/mpeg" length="123" />');
  expect(out).toContain('<media:content url="https://acme.com/e.jpg"');
});

test("jsonFeed() unaffected by media field", () => {
  const jf = jsonFeed(feed, [
    { title: "X", link: "https://acme.com/x", media: { url: "https://acme.com/x.jpg" } },
  ]);
  expect(jf.items[0]!.url).toBe("https://acme.com/x");
});

const pod: PodcastFeed = {
  title: "The Show",
  link: "https://show.fm",
  description: "A show",
  image: "https://show.fm/cover.jpg",
  itunesAuthor: "Jane",
  category: ["Technology", "Society & Culture > Personal Journals"],
  explicit: false,
  podcastType: "episodic",
  owner: { name: "Jane", email: "jane@show.fm" },
};

const eps: PodcastEpisode[] = [
  {
    title: "Ep 1",
    link: "https://show.fm/1",
    date: "2026-02-01T00:00:00Z",
    duration: 1830,
    episode: 1,
    season: 1,
    episodeType: "full",
    enclosure: { url: "https://show.fm/1.mp3", type: "audio/mpeg", length: 29344 },
  },
];

test("podcastRss() emits the iTunes namespace and channel tags", () => {
  const out = podcastRss(pod, eps);
  expect(out).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
  expect(out).toContain("<itunes:author>Jane</itunes:author>");
  expect(out).toContain('<itunes:image href="https://show.fm/cover.jpg" />');
  expect(out).toContain("<itunes:explicit>no</itunes:explicit>");
  expect(out).toContain("<itunes:type>episodic</itunes:type>");
  expect(out).toContain("<itunes:name>Jane</itunes:name>");
  expect(out).toContain("<itunes:email>jane@show.fm</itunes:email>");
  expect(out).toContain('<itunes:category text="Technology" />');
  expect(out).toContain(
    '<itunes:category text="Society &amp; Culture"><itunes:category text="Personal Journals" /></itunes:category>',
  );
});

test("podcastRss() emits per-episode enclosure, duration, episode, season", () => {
  const out = podcastRss(pod, eps);
  expect(out).toContain(
    '<enclosure url="https://show.fm/1.mp3" type="audio/mpeg" length="29344" />',
  );
  expect(out).toContain("<itunes:duration>30:30</itunes:duration>");
  expect(out).toContain("<itunes:episode>1</itunes:episode>");
  expect(out).toContain("<itunes:season>1</itunes:season>");
  expect(out).toContain("<itunes:episodeType>full</itunes:episodeType>");
});

test("podcastRss() passes a string duration through, formats hours from seconds", () => {
  const out = podcastRss(pod, [
    { ...eps[0]!, duration: "1:02:03" },
  ]);
  expect(out).toContain("<itunes:duration>1:02:03</itunes:duration>");
  const out2 = podcastRss(pod, [{ ...eps[0]!, duration: 3723 }]);
  expect(out2).toContain("<itunes:duration>1:02:03</itunes:duration>");
});

test("podcastRssResponse() has an rss content-type", async () => {
  const res = podcastRssResponse(pod, eps);
  expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
  expect(await res.text()).toContain("<itunes:author>Jane</itunes:author>");
});
