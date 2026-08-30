/** 仅展示稳定错误码，不显示可能包含窗口内容的原生异常正文 */
export function computerPauseHint(code?: string): string {
  switch (code) {
    case "computer_activation_required":
    case "computer_focus_changed":
      return "请手动切换到授权窗口，然后点击继续。";
    case "computer_user_takeover":
      return "检测到你的操作；准备好后点击继续，AI 会重新观察窗口。";
    case "computer_display_changed":
    case "computer_observation_stale":
      return "窗口或显示器状态已变化，点击继续重新观察。";
    case "computer_target_occluded":
      return "目标区域被遮挡，请移开遮挡窗口后继续。";
    case "computer_password_protected":
      return "不能操作密码控件，请手动处理后继续。";
    case "computer_busy":
      return "上一项操作尚未结束，请稍后重试。";
    case "computer_window_unavailable":
      return "授权窗口不可用，请恢复窗口；窗口已关闭时需取消后重新授权。";
    default:
      return "恢复未完成，可重试或取消；AI 不会在暂停期间继续输入。";
  }
}
