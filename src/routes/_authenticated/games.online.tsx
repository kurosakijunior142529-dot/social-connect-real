import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/games/online")({
  component: OnlineLayout,
  head: () => ({ meta: [{ title: "Multiplayer online · vibely" }] }),
});

function OnlineLayout() {
  return <Outlet />;
}

