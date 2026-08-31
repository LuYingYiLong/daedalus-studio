export type ComputerPauseHintKey =
  | "computer.overlay.pauseHints.activation"
  | "computer.overlay.pauseHints.userTakeover"
  | "computer.overlay.pauseHints.displayChanged"
  | "computer.overlay.pauseHints.targetOccluded"
  | "computer.overlay.pauseHints.passwordProtected"
  | "computer.overlay.pauseHints.busy"
  | "computer.overlay.pauseHints.windowUnavailable"
  | "computer.overlay.pauseHints.default";

/** 将稳定错误码映射为本地化 key，不显示可能包含窗口内容的原生异常正文 */
export function computerPauseHintKey(code?: string): ComputerPauseHintKey {
  switch (code) {
    case "computer_activation_required":
    case "computer_focus_changed":
      return "computer.overlay.pauseHints.activation";
    case "computer_user_takeover":
      return "computer.overlay.pauseHints.userTakeover";
    case "computer_display_changed":
    case "computer_observation_stale":
      return "computer.overlay.pauseHints.displayChanged";
    case "computer_target_occluded":
      return "computer.overlay.pauseHints.targetOccluded";
    case "computer_password_protected":
      return "computer.overlay.pauseHints.passwordProtected";
    case "computer_busy":
      return "computer.overlay.pauseHints.busy";
    case "computer_window_unavailable":
      return "computer.overlay.pauseHints.windowUnavailable";
    default:
      return "computer.overlay.pauseHints.default";
  }
}
