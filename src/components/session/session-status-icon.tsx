import {
  ChartCircle,
  RefreshCircle,
  Alarm,
  PauseCircle,
} from "iconsax-reactjs";
import { FaCircleCheck } from "react-icons/fa6";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";

interface SessionStatusIconProps {
  status: Session["status"];
  isStreaming: boolean;
  isResuming: boolean;
  isCreating: boolean;
  hasPendingPermission: boolean;
  className?: string;
}

export const STATUS_BG_COLORS_MAP = {
  creating: "bg-yellow-600 dark:bg-yellow-500",
  resuming: "bg-yellow-600 dark:bg-yellow-500",
  pending_permission: "bg-orange-600 dark:bg-orange-500",
  streaming: "bg-blue-600 dark:bg-blue-500",
  completed: "bg-green-600 dark:bg-green-500",
  terminated: "bg-gray-500 dark:bg-gray-400",
  paused: "bg-gray-500 dark:bg-gray-400",
};

export function SessionStatusIcon({
  status,
  isStreaming,
  isResuming,
  isCreating,
  hasPendingPermission,
  className,
}: SessionStatusIconProps) {
  // Priority order: creating/resuming > pending permission > streaming > completed/terminated

  if (isCreating || isResuming) {
    return (
      <RefreshCircle
        size={16}
        className={cn(
          "shrink-0 animate-spin text-yellow-600 dark:text-yellow-500",
          className
        )}
      />
    );
  }

  if (hasPendingPermission) {
    return (
      <Alarm
        size={16}
        variant="Bold"
        className={cn(
          "shrink-0 text-orange-600 dark:text-orange-500",
          className
        )}
      />
    );
  }

  if (isStreaming) {
    return (
      <ChartCircle
        size={16}
        className={cn(
          "shrink-0 animate-spin text-blue-600 dark:text-blue-500",
          className
        )}
      />
    );
  }

  if (status === "terminated" || status === "paused") {
    return (
      <PauseCircle
        size={16}
        variant="Bold"
        className={cn("shrink-0 text-gray-500 dark:text-gray-400", className)}
      />
    );
  }

  if (status === "active") {
    return (
      <FaCircleCheck
        size={16}
        className={cn("shrink-0 text-green-600 dark:text-green-500", className)}
      />
    );
  }

  return null;
}
