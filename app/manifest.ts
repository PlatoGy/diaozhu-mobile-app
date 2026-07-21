import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "吊主",
    short_name: "吊主",
    description: "四人在线吊主牌桌",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0b3027",
    theme_color: "#0b3027",
  };
}
