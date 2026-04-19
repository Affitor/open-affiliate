import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  interpolate,
} from "remotion";

export type KenBurns = "none" | "zoomSlow" | "zoomIn" | "zoomOut" | "panLR";

export interface VideoSceneProps {
  /** Source start in seconds. */
  srcTime: number;
  /** Scene duration in frames. */
  durationInFrames: number;
  fps: number;
  ken?: KenBurns;
}

/**
 * Plays a cut from public/raw.mp4 with an optional Ken Burns effect.
 * Source is 3580x2160; Remotion will scale to fill 1920x1080 via object-fit cover.
 */
export const VideoScene: React.FC<VideoSceneProps> = ({
  srcTime,
  durationInFrames,
  fps,
  ken = "none",
}) => {
  const frame = useCurrentFrame();

  // Ken Burns transforms
  let scale = 1;
  let translateX = 0;
  const translateY = 0;

  if (ken === "zoomSlow") {
    scale = interpolate(frame, [0, durationInFrames], [1.0, 1.025], {
      extrapolateRight: "clamp",
    });
  } else if (ken === "zoomIn") {
    scale = interpolate(frame, [0, durationInFrames], [1.0, 1.05], {
      extrapolateRight: "clamp",
    });
  } else if (ken === "zoomOut") {
    scale = interpolate(frame, [0, durationInFrames], [1.05, 1.0], {
      extrapolateRight: "clamp",
    });
  } else if (ken === "panLR") {
    scale = 1.04;
    translateX = interpolate(frame, [0, durationInFrames], [20, -20], {
      extrapolateRight: "clamp",
    });
  }

  // trimBefore is measured in the COMPOSITION's fps (not source fps)
  const trimBefore = Math.floor(srcTime * fps);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        <OffthreadVideo
          src={staticFile("raw-nofacecam.mp4")}
          trimBefore={trimBefore}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
