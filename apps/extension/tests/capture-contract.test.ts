import { describe, expect, it } from "vitest";
import { createCaptureRequest, toBitmapRect } from "../src/vision/capture-contract";

describe("event-triggered capture coordinate contract", () => {
  it("records the event and maps viewport CSS coordinates to bitmap pixels", () => {
    const capture = createCaptureRequest("NAVIGATION", {
      scrollX: 10,
      scrollY: 20,
      viewportWidthCss: 800,
      viewportHeightCss: 600,
      devicePixelRatio: 2,
      bitmapWidth: 1600,
      bitmapHeight: 1200,
    });
    expect(capture.trigger).toBe("NAVIGATION");
    expect(toBitmapRect({ x: 10, y: 20, width: 5, height: 6 }, capture)).toEqual({
      x: 20,
      y: 40,
      width: 10,
      height: 12,
    });
  });
});
