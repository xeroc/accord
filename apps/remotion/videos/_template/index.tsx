import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { TitleScene } from "./scenes/title";

export const video = defineVideo({
  id: "__SLUG__",
  component: TemplateVideo,
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 150,
});

function TemplateVideo() {
  return (
    <Stage>
      <TitleScene subtitle="Replace scenes/ and extend this composition." />
    </Stage>
  );
}
