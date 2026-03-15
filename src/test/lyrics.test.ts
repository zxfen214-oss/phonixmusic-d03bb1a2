import { describe, it, expect } from "vitest";
import { parseLRC, getCurrentLyricIndex } from "@/lib/lyrics";

describe("parseLRC with parenthesized text", () => {
  const lrc = `[00:10.00]Hello world
[00:15.00]This is (ooh yeah) great
[00:20.00]Next line here
[00:25.00]Final line`;

  it("extracts parenthesized text as secondaryText", () => {
    const result = parseLRC(lrc);
    expect(result.lines.length).toBe(4);
    const line15 = result.lines.find((l) => l.time === 15);
    expect(line15).toBeDefined();
    expect(line15!.text).toBe("This is great");
    expect(line15!.secondaryText).toBe("(ooh yeah)");
  });

  it("getCurrentLyricIndex works correctly with no extra lines", () => {
    const result = parseLRC(lrc);
    const idx = getCurrentLyricIndex(result.lines, 21);
    expect(result.lines[idx].text).toBe("Next line here");
    expect(result.lines[idx].secondaryText).toBeUndefined();
  });

  it("line with only parenthesized text keeps it as main text", () => {
    const lrc2 = `[00:05.00](La la la)`;
    const result = parseLRC(lrc2);
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].text).toBe("(La la la)");
  });

  it("line without parentheses has no secondaryText", () => {
    const lrc3 = `[00:05.00]Normal line`;
    const result = parseLRC(lrc3);
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].secondaryText).toBeUndefined();
  });
});

describe("parseLRC special commands", () => {
  it("parses <left> and <right> alignment directives", () => {
    const lrc = `<right>
[00:05.00]Right aligned text
<left>
[00:10.00]Left aligned text`;
    const result = parseLRC(lrc);
    expect(result.lines.length).toBe(2);
    expect(result.lines[0].alignment).toBe("right");
    expect(result.lines[1].alignment).toBe("left");
    expect(result.defaultAlignment).toBe("left");
  });

  it("parses <music> tag", () => {
    const lrc = `<music>00:00</music>00:30
[00:30.00]First lyric`;
    const result = parseLRC(lrc);
    expect(result.lines.length).toBe(2);
    expect(result.lines[0].isMusic).toBe(true);
    expect(result.lines[0].time).toBe(0);
    expect(result.lines[0].musicEnd).toBe(30);
  });

  it("parses <nl> tag", () => {
    const lrc = `[00:05.00]First line<nl>
[00:10.00]Second line`;
    const result = parseLRC(lrc);
    expect(result.lines.length).toBe(2);
    expect(result.lines[0].isNl).toBe(true);
    expect(result.lines[1].isNl).toBeFalsy();
  });

  it("parses inline alignment", () => {
    const lrc = `[00:05.00]<right>Right inline`;
    const result = parseLRC(lrc);
    expect(result.lines[0].alignment).toBe("right");
    expect(result.lines[0].text).toBe("Right inline");
  });
});
