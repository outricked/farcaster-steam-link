"use client";

import dynamic from "next/dynamic";

// note: dynamic import is required for components that use the Frame SDK
const Demo = dynamic(() => import("~/components/Demo2").then((mod) => mod.Demo2), {
  ssr: false,
});

export default function App() {
  return <Demo />;
}
