import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/games/online")({
  component: Outlet,
  head: () => ({ meta: [{ title: "Multiplayer online · vibely" }] }),
});

