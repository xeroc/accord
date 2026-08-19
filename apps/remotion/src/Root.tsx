import { Composition, Folder } from "remotion";

import { videos } from "./videos.gen";

/**
 * One <Folder><Composition/></Folder> per videos/<slug>/ entry, mounted
 * from the generated manifest (src/videos.gen.ts — see src/cli/sync.ts).
 */
export const RemotionRoot: React.FC = () => (
  <>
    {videos.map((video) => (
      <Folder key={video.id} name={video.id}>
        <Composition
          id={video.id}
          component={video.component}
          durationInFrames={video.durationInFrames}
          fps={video.fps}
          width={video.width}
          height={video.height}
          defaultProps={video.defaultProps}
        />
      </Folder>
    ))}
  </>
);
