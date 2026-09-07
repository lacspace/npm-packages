import { test, expect } from "vitest";
import { dataset, book, podcastEpisode } from "./index";

test("dataset builds a Dataset with creator + distributions", () => {
  const ld = dataset({
    name: "Prices",
    description: "Daily prices.",
    url: "https://x.com/data",
    license: "https://x.com/license",
    keywords: ["prices", "csv"],
    creator: { name: "Lacspace", url: "https://lacspace.com" },
    distribution: [{ contentUrl: "https://x.com/data.csv", encodingFormat: "text/csv" }],
  }) as any;
  expect(ld["@type"]).toBe("Dataset");
  expect(ld.creator).toEqual({ "@type": "Organization", name: "Lacspace", url: "https://lacspace.com" });
  expect(ld.distribution[0]).toEqual({ "@type": "DataDownload", contentUrl: "https://x.com/data.csv", encodingFormat: "text/csv" });
});

test("dataset prunes empty keywords and missing creator", () => {
  const ld = dataset({ name: "D", description: "d", keywords: [] }) as any;
  expect(ld.keywords).toBeUndefined();
  expect(ld.creator).toBeUndefined();
  expect(ld.distribution).toBeUndefined();
});

test("book accepts a string author and maps bookFormat to a schema URL", () => {
  const ld = book({ name: "The Book", author: "Ada", bookFormat: "EBook", isbn: "978-0" }) as any;
  expect(ld["@type"]).toBe("Book");
  expect(ld.author).toEqual({ "@type": "Person", name: "Ada" });
  expect(ld.bookFormat).toBe("https://schema.org/EBook");
  expect(ld.isbn).toBe("978-0");
});

test("book accepts an object author with url", () => {
  const ld = book({ name: "B", author: { name: "Ada", url: "https://x.com/ada" }, publisher: "Lacspace" }) as any;
  expect(ld.author).toEqual({ "@type": "Person", name: "Ada", url: "https://x.com/ada" });
  expect(ld.publisher).toEqual({ "@type": "Organization", name: "Lacspace" });
});

test("podcastEpisode wraps audio + series", () => {
  const ld = podcastEpisode({
    name: "Ep 1",
    duration: "PT42M",
    episodeNumber: 1,
    audioUrl: "https://x.com/ep1.mp3",
    seriesName: "The Show",
  }) as any;
  expect(ld["@type"]).toBe("PodcastEpisode");
  expect(ld.timeRequired).toBe("PT42M");
  expect(ld.associatedMedia).toEqual({ "@type": "MediaObject", contentUrl: "https://x.com/ep1.mp3" });
  expect(ld.partOfSeries).toEqual({ "@type": "PodcastSeries", name: "The Show" });
});
