"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useMe } from "@/features/shell/useMe";

import { useGuideModal } from "./GuideModal";
import { GuidePage } from "./GuidePage";

/**
 * `/getting-started` deep link. With the shell's guide modal available, an ADMIN lands on the
 * overview with the guide open over it; otherwise (no modal, other roles) the page renders.
 */
export function GettingStartedRoute() {
  const guide = useGuideModal();
  const router = useRouter();
  const me = useMe();
  const handed = useRef(false);
  const toModal = guide !== null && me.data?.user.role === "ADMIN";

  useEffect(() => {
    if (!toModal || handed.current) return;
    handed.current = true;
    guide.open();
    router.replace("/ops");
  }, [guide, router, toModal]);

  if (toModal) return null;
  return <GuidePage />;
}
